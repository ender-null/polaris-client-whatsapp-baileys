/* eslint-disable @typescript-eslint/no-explicit-any */
import makeWASocket, { WAMessage } from 'baileys';
import { FileResult } from 'tmp';
import WebSocket from 'ws';
import { Config } from './config';
import { ConversationType, Message, User, WSInit, WSPing } from './types';
import { fromBase64, logger } from './utils';

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
    console.log(msg);
    await this.client.sendPresenceUpdate('available');
    /*const id: string = msg.id;
    const extra: Extra = {
      //originalMessage: msg,
    };
    const chat = await this.client.getChatById(msg.chatId);
    const conversation = chat.groupMetadata
      ? new Conversation(`-${chat.groupMetadata.id.user}`, chat.groupMetadata.subject, 'group')
      : new Conversation(chat.id.user, chat.contact.pushname, 'private');
    const senderId = msg.sender.id.toString().split('@')[0];
    const sender = new User(senderId, msg.sender.pushname, null, senderId, false);
    let content;
    let type;

    if (msg.type === MessageType.CHAT) {
      content = msg.content;
      type = 'text';
      if (msg.mentionedJidList) {
        extra.mentions = msg.mentionedJidList;
      }
    } else if (msg.type === MessageType.IMAGE) {
      content = msg.content;
      type = 'photo';
      extra.caption = msg['caption'];
    } else {
      type = 'unsupported';
    }
    let reply: Message = null;
    if (msg.quotedMsgId) {
      const quotedMsg = await this.client.getMessageById(msg.quotedMsgId);
      reply = await this.convertMessage(quotedMsg);
    }

    const date = msg.timestamp;
    return new Message(id, conversation, sender, content, type, date, reply, extra);
    */
  }

  formatChatId(conversationId: number | string, type: ConversationType) {
    const isGroup = type !== 'private' || String(conversationId).startsWith('-');
    return isGroup ? `${String(conversationId).slice(1)}@g.us` : `${conversationId}@lid`;
  }

  async sendMessage(msg: Message): Promise<WAMessage> {
    console.log(msg);
    /*await this.client.setOnlinePresence(true);
    const chatId = this.formatChatId(msg.conversation.id, msg.conversation.type);
    await this.client.startTyping(chatId);

    let caption = msg.extra?.caption;
    if (msg.extra && msg.extra.format && msg.extra.format === 'HTML') {
      caption = htmlToWhatsAppMarkdown(msg.extra?.caption);
    }
    caption = caption?.trim();
    const quotedMessageId = msg.reply ? String(msg.reply.id) : null;

    let downloadedFile: FileResult = null;
    if (
      msg.type != 'text' &&
      msg.content &&
      (msg.content.startsWith('http://') || msg.content.startsWith('https://'))
    ) {
      downloadedFile = await downloadFileFromUrl(msg.content);
    }

    if (msg.type == 'text') {
      if (!msg.content || (typeof msg.content == 'string' && msg.content.length == 0)) {
        return null;
      }
      let preview = false;
      if (msg.extra && 'preview' in msg.extra) {
        preview = msg.extra.preview;
      }
      let text = msg.content;
      if (msg.extra && msg.extra.format && msg.extra.format === 'HTML') {
        text = htmlToWhatsAppMarkdown(text);
      }
      text = text.trim();
      const result = text.matchAll(/@\d+/gim);
      const mentionsFound = [...result][0];
      const mentions: any[] = mentionsFound?.map((mention) => `${mention.slice(1)}@lid`);
      this.client.sendText(chatId, text, {
        linkPreview: preview,
        mentionedList: mentions,
        quotedMsg: quotedMessageId,
      });
    } else if (msg.type == 'photo') {
      if (downloadedFile) {
        this.client.sendImage(chatId, downloadedFile.name, msg.type, msg.extra.caption, quotedMessageId);
      } else {
        this.client.sendImageFromBase64(chatId, msg.content, msg.type, msg.extra.caption, quotedMessageId);
      }
    } else if (msg.type == 'animation') {
      if (downloadedFile) {
        this.client.sendGif(chatId, downloadedFile.name, msg.type, msg.extra.caption);
      } else {
        this.client.sendGifFromBase64(chatId, msg.content, msg.type, msg.extra.caption);
      }
    } else if (msg.type == 'voice' || msg.type == 'audio') {
      if (downloadedFile) {
        this.client.sendPtt(chatId, downloadedFile.name, msg.type, msg.extra.caption, quotedMessageId);
      } else {
        this.client.sendPttFromBase64(chatId, msg.content, msg.type, msg.extra.caption, quotedMessageId);
      }
    } else if (msg.type == 'document') {
      this.client.sendFile(chatId, msg.content, {
        caption: msg.extra.caption,
        filename: msg.type,
        quotedMsg: quotedMessageId,
      });
    } else if (msg.type == 'video') {
      if (downloadedFile) {
        this.client.sendVideoAsGif(chatId, downloadedFile.name, msg.type, msg.extra.caption);
      } else {
        this.client.sendVideoAsGifFromBase64(chatId, msg.content, msg.type, msg.extra.caption, quotedMessageId);
      }
    }
    await this.client.stopTyping(chatId);
    */
    return null;
  }

  async getInputFile(content: string): Promise<string> {
    if (content.startsWith('/')) {
      const file: FileResult = await fromBase64(content);
      return file.name;
    }
    return null;
  }
}
