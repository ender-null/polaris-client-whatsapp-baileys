import winston, { createLogger, transports, format as winstonFormat } from 'winston';
import 'winston-daily-rotate-file';
import fs from 'fs';
import https from 'https';
import http from 'http';
import { FileResult, fileSync } from 'tmp';
import { FileTypeResult, fromBuffer } from 'file-type';

export const catchException = (exception: Error): Error => {
  logger.error(`Catch exception: ${exception.message}`);
  return exception;
};

export const replaceHtml = (text: string): string => {
  if (text) {
    text = text.replace(new RegExp('<', 'gim'), '&lt;');
    text = text.replace(new RegExp('>', 'gim'), '&gt;');
  }
  return text;
};

export const htmlToWhatsAppMarkdown = (text: string): string => {
  if (text) {
    text = text.replace(/<a href="([\s\S]*?)">([\s\S]*?)<\/a>/gim, '$1');
    text = text.replace(/<i>([\s\S]*?)<\/i>/gim, '_$1_');
    text = text.replace(/<b>([\s\S]*?)<\/b>/gim, '*$1*');
    text = text.replace(/<u>([\s\S]*?)<\/u>/gim, '~$1~');
    text = text.replace(/<code>([\s\S]*?)<\/code>/gim, '`$1`');
    text = text.replace(/<pre>([\s\S]*?)<\/pre>/gim, '```$1```');
    text = text.replace(
      /<blockquote>([\s\S]*?)<\/blockquote>/gim,
      (_, p1) => '> ' + p1.replace(/\r?\n/gim, '\n> ').trim(),
    );

    text = text.replace(/&lt;/gim, '<');
    text = text.replace(/&gt;/gim, '>');
  }
  return text;
};

export const isInt = (number: number | string): boolean => {
  if (typeof number == 'number') {
    return true;
  } else if (typeof number != 'string') {
    return false;
  }
  return !isNaN(parseFloat(number));
};

export const toBase64 = (filePath): Promise<string> => {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, (err, data) => {
      if (err) {
        reject(err);
        return;
      }
      const base64String = data.toString('base64');
      resolve(base64String);
    });
  });
};

export const fromBase64 = (base64String): Promise<FileResult> => {
  return new Promise((resolve, reject) => {
    const bufferData = Buffer.from(base64String, 'base64');
    fromBuffer(bufferData).then((info: FileTypeResult) => {
      const file: FileResult = fileSync({ mode: 0o644, postfix: `.${info.ext}` });
      fs.writeFile(file.name, bufferData, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(file);
      });
    });
  });
};

export const downloadFileFromUrl = (url: string): Promise<FileResult> => {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    const file: FileResult = fileSync({ mode: 0o644, postfix: '.tmp' });

    client
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download file: ${response.statusCode} ${response.statusMessage}`));
          return;
        }

        const fileStream = fs.createWriteStream(file.name);
        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          resolve(file);
        });

        fileStream.on('error', (err) => {
          fs.unlink(file.name, () => {});
          reject(err);
        });
      })
      .on('error', (err) => {
        reject(err);
      });
  });
};

export const loggerFormat = winstonFormat.printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message} `;
  if (metadata && Object.keys(metadata).length > 0) {
    msg += JSON.stringify(metadata);
  }
  return msg;
});

export const transport = new winston.transports.DailyRotateFile({
  dirname: 'logs',
  filename: 'polaris-client-whatsapp-web-js-%DATE%.log',
  datePattern: 'YYYY-MM-DD-HH',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '7d',
});

// Configure logger
export const logger = createLogger({
  level: 'info',
  format: winstonFormat.combine(winstonFormat.timestamp(), winstonFormat.json()),
  transports: [
    new transports.Console({
      format: winstonFormat.combine(
        winstonFormat.colorize(),
        winstonFormat.timestamp({
          format: 'HH:mm:ss',
        }),
        loggerFormat,
      ),
    }),
    transport,
  ],
});
