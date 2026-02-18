import { AuthenticationCreds, BufferJSON, initAuthCreds, proto, SignalDataTypeMap } from 'baileys';
import { randomBytes } from 'crypto';
import mongoose, { Schema, Document } from 'mongoose';
import { join } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { logger } from './utils';

export const getPersistentSessionId = (filename: string = 'session_id.txt') => {
  const filePath = join(process.cwd(), filename);

  if (existsSync(filePath)) {
    return readFileSync(filePath, 'utf8').trim();
  } else {
    const newId = randomBytes(6).toString('hex');
    writeFileSync(filePath, newId, 'utf8');
    logger.info(`Created new persistent session ID: ${newId}`);
    return newId;
  }
};

interface IAuth extends Document {
  sessionId: string;
  key: string;
  value: any;
}

const AuthSchema = new Schema<IAuth>({
  sessionId: { type: String, required: true, index: true },
  key: { type: String, required: true },
  value: { type: Schema.Types.Mixed },
});

AuthSchema.index({ sessionId: 1, key: 1 }, { unique: true });

const AuthModel = mongoose.model<IAuth>('Auth', AuthSchema);

export const useMongooseAuthState = async (sessionId: string) => {
  const writeData = async (data: any, key: string) => {
    try {
      const value = JSON.parse(JSON.stringify(data, BufferJSON.replacer));

      await AuthModel.findOneAndUpdate(
        { sessionId, key },
        { value },
        {
          upsert: true,
          returnDocument: 'after',
          setDefaultsOnInsert: true,
        },
      );
    } catch (err) {
      logger.error(`Failed to save ${key}:`, err);
    }
  };

  const readData = async (key: string) => {
    try {
      const res = await AuthModel.findOne({ sessionId, key }).lean();
      if (!res) return null;

      const raw = JSON.stringify(res.value);
      return JSON.parse(raw, BufferJSON.reviver);
    } catch (error) {
      return null;
    }
  };

  const removeData = async (key: string) => {
    await AuthModel.deleteOne({ sessionId, key });
  };

  const creds: AuthenticationCreds = (await readData('creds')) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(
          type: T,
          ids: string[],
        ): Promise<{ [id: string]: SignalDataTypeMap[T] }> => {
          const data: { [id: string]: SignalDataTypeMap[T] } = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value as SignalDataTypeMap[T];
            }),
          );
          return data;
        },
        set: async (data) => {
          const tasks: Promise<void>[] = [];
          for (const category in data) {
            for (const id in data[category as keyof SignalDataTypeMap]) {
              const value = data[category as keyof SignalDataTypeMap]![id];
              const key = `${category}-${id}`;
              tasks.push(value ? writeData(value, key) : removeData(key));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => writeData(creds, 'creds'),
  };
};
