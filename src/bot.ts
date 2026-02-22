/* eslint-disable @typescript-eslint/no-explicit-any */
import makeWASocket, { WAMediaUpload, WAMessage, generateMessageIDV2 } from 'baileys';
import { FileResult } from 'tmp';
import WebSocket from 'ws';
import { Config } from './config';
import { Conversation, ConversationType, Extra, Message, User, WSInit, WSPing } from './types';
import { fromBase64, htmlToWhatsAppMarkdown, logger } from './utils';

export class Bot {
  user: User;
  websocket: WebSocket;
  client: ReturnType<typeof makeWASocket>;

  constructor(websocket: WebSocket, client: ReturnType<typeof makeWASocket>) {
    this.websocket = websocket;
    this.client = client;
  }

  async init() {
    const user = await this.client.user;
    const userId = user.lid.split(':')[0];
    this.user = {
      id: userId,
      firstName: user.name,
      lastName: null,
      username: userId,
      isBot: false,
    };
    const config: Config = process.env.CONFIG ? JSON.parse(process.env.CONFIG) : undefined;
    const data: WSInit = {
      bot: this.user.username,
      platform: 'whatsapp',
      type: 'init',
      user: this.user,
      config,
    };
    await this.client.sendPresenceUpdate('available');
    this.websocket.send(JSON.stringify(data, null, 4));
    logger.info(`Connected as @${data.user.username}`);
  }

  ping() {
    logger.debug('ping');
    if (this.user) {
      const data: WSPing = {
        bot: this.user.username,
        platform: 'whatsapp',
        type: 'ping',
      };
      this.websocket.send(JSON.stringify(data, null, 4));
    }
  }

  async convertMessage(msg: WAMessage) {
    await this.client.sendPresenceUpdate('available');
    await this.client.readMessages([msg.key]);
    const id: string = msg.key.id;
    const extra: Extra = {
      //originalMessage: msg,
    };
    const conversationId = msg.key.remoteJid.split('@')[0];
    const conversationType = msg.key.remoteJid.split('@')[1] === 'g.us' ? 'group' : 'private';
    const groupMetadata = conversationType === 'group' ? await this.client.groupMetadata(msg.key.remoteJid) : null;
    const conversationName = groupMetadata?.subject ?? msg.pushName ?? conversationId;
    const conversation = new Conversation(conversationId, conversationName, conversationType);
    const senderId = msg.key.participant.length ? msg.key.participant.split('@')[0] : conversationId;
    const sender = new User(senderId, msg.pushName, null, senderId, false);
    let content;
    let type;

    if (msg.message?.conversation) {
      content = msg.message?.conversation;
      type = 'text';
    } else if (msg.message?.extendedTextMessage?.text) {
      content = msg.message?.extendedTextMessage?.text;
      type = 'text';
    } else if (msg.message?.imageMessage) {
      content = msg.message?.imageMessage?.url;
      type = 'image';
    } else if (msg.message?.videoMessage) {
      content = msg.message?.videoMessage?.url;
      type = 'video';
    } else if (msg.message?.audioMessage) {
      content = msg.message?.audioMessage?.url;
      type = 'audio';
    } else if (msg.message?.stickerMessage) {
      content = msg.message?.stickerMessage?.url;
      type = 'sticker';
    } else if (msg.message?.documentMessage) {
      content = msg.message?.documentMessage?.url;
      type = 'document';
    }

    const date = Number(msg.messageTimestamp);
    const reply = null;
    return new Message(id, conversation, sender, content, type, date, reply, extra);
  }

  formatChatId(conversationId: number | string, type: ConversationType) {
    const isLegacyGroup = String(conversationId).startsWith('-');
    const isGroup = type !== 'private' || isLegacyGroup;
    if (isGroup) {
      return `${isLegacyGroup ? String(conversationId).slice(1) : conversationId}@g.us`;
    }
    return `${conversationId}@lid`;
  }

  async sendMessage(msg: Message): Promise<WAMessage> {
    if (msg.type == 'text') {
      const id = generateMessageIDV2(this.client.user?.id);
      const chatId = this.formatChatId(msg.conversation.id, msg.conversation.type);
      let text = msg.content;
      if (msg.extra && msg.extra.format && msg.extra.format === 'HTML') {
        text = htmlToWhatsAppMarkdown(text);
      }
      text = text.trim();

      const result = text.matchAll(/@\d+/gim);
      const mentionsFound = [...result][0];
      const mentions: any[] = mentionsFound?.map((mention) => `${mention.slice(1)}@lid`);

      await this.client.sendMessage(chatId, { text, mentions }, { messageId: id });
    } else if (msg.type == 'photo') {
      const id = generateMessageIDV2(this.client.user?.id);
      const chatId = this.formatChatId(msg.conversation.id, msg.conversation.type);
      const media = await this.getMediaUpload(msg.content);
      await this.client.sendMessage(chatId, { image: media, caption: msg.extra?.caption }, { messageId: id });
    } else if (msg.type == 'audio' || msg.type == 'voice') {
      const id = generateMessageIDV2(this.client.user?.id);
      const chatId = this.formatChatId(msg.conversation.id, msg.conversation.type);
      const media = await this.getMediaUpload(msg.content);
      await this.client.sendMessage(chatId, { audio: media, ptt: msg.type === 'voice' }, { messageId: id });
    }

    return null;
  }

  async getMediaUpload(content: string): Promise<WAMediaUpload> {
    let mediaUpload = null;
    if (content.startsWith('http')) {
      mediaUpload = { url: content };
    } else if (!content.startsWith('/')) {
      const file: FileResult = await fromBase64(content);
      mediaUpload = { url: file.name };
    } else {
      mediaUpload = { url: content };
    }
    return mediaUpload;
  }
}
