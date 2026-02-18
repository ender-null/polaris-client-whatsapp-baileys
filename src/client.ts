/* eslint-disable prefer-const */
import NodeCache from '@cacheable/node-cache';
import { Boom } from '@hapi/boom';
import makeWASocket, {
  CacheStore,
  DEFAULT_CONNECTION_CONFIG,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from 'baileys';
import QRCode from 'qrcode';
import WebSocket from 'ws';
import { Bot } from './bot';
import { WSPing } from './types';
import { catchException, logger } from './utils';

let bot: Bot;
let ws: WebSocket;
let pingInterval;

const close = () => {
  logger.warn(`Close server`);
  ws.terminate();
  process.exit();
};

process.on('SIGINT', () => close());
process.on('SIGTERM', () => close());
process.on('exit', () => {
  logger.warn(`Exit process`);
});

if (!process.env.SERVER) {
  logger.warn(`Missing env variable SERVER`);
  close();
}

const msgRetryCounterCache = new NodeCache() as CacheStore;

const serverUrl = process.env.SERVER;

const startSock = async () => {
  const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    waWebSocketUrl: process.env.SOCKET_URL ?? DEFAULT_CONNECTION_CONFIG.waWebSocketUrl,
    auth: {
      creds: state.creds,
      /** caching makes the store faster to send/recv messages */
      keys: makeCacheableSignalKeyStore(state.keys),
    },
    msgRetryCounterCache,
    generateHighQualityLinkPreview: true,
    // ignore all broadcast messages -- to receive the same
    // comment the line below out
    // shouldIgnoreJid: jid => isJidBroadcast(jid),
    // implement to handle retries & poll updates
    //getMessage,
  });

  sock.ev.process(
    // events is a map for event name => event data
    async (events) => {
      // something about the connection changed
      // maybe it closed, or we received all offline message or connection opened
      if (events['connection.update']) {
        const update = events['connection.update'];
        const { connection, lastDisconnect, qr } = update;
        if (connection === 'close') {
          // reconnect if not logged out
          if ((lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut) {
            startSock();
          } else {
            logger.error('Connection closed. You are logged out.');
          }
        }

        if (qr) {
          console.log(await QRCode.toString(qr, { type: 'terminal', small: true }));
        }

        logger.debug(JSON.stringify(update), 'connection update');
      }

      // credentials updated -- save them
      if (events['creds.update']) {
        await saveCreds();
        logger.debug('creds save triggered');
      }
    },
  );

  return sock;
};

startSock()
  .then(async (client) => await start(client as any))
  .catch((error) => logger.error(error.message));

clearInterval(pingInterval);
pingInterval = setInterval(() => {
  if (!ws) return;
  if (bot) {
    bot.ping();
  } else {
    const data: WSPing = {
      bot: 'unauthenticated',
      platform: 'whatsapp',
      type: 'ping',
    };
    ws.send(JSON.stringify(data, null, 4));
  }
}, 30000);

const start = async (client: ReturnType<typeof startSock>) => {
  const user = (await client).user;
  console.log(user);
  const accountId = user.lid.split(':')[0];
  ws = new WebSocket(`${serverUrl}?platform=whatsapp&accountId=${accountId}`);

  ws.on('open', async () => {
    bot = new Bot(ws, client as any);
    /*bot.client.onMessage(async (message) => {
      const msg = await bot.convertMessage(message);
      const data: WSMessage = {
        bot: bot.user.username,
        platform: 'whatsapp',
        type: 'message',
        message: msg,
      };
      ws.send(JSON.stringify(data));
    });*/
    await bot.init();
  });

  ws.on('error', async (error: WebSocket.ErrorEvent) => {
    if (error['code'] === 'ECONNREFUSED') {
      logger.info(`Waiting for server to be available...`);
    } else {
      logger.error(error);
    }
  });

  ws.on('close', async (code) => {
    if (bot) await bot.client.sendPresenceUpdate('available');

    if (code === 1005) {
      logger.warn(`Disconnected`);
    } else if (code === 1006) {
      logger.warn(`Terminated`);
    }
    clearInterval(pingInterval);
    process.exit();
  });

  ws.on('message', (data: string) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type !== 'pong') {
        logger.info(JSON.stringify(msg, null, 4));
      }
      if (msg.type === 'message') {
        bot.sendMessage(msg.message);
      }
    } catch (error) {
      catchException(error);
    }
  });
};
