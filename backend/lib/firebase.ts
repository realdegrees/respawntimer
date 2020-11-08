import firebase from 'firebase';
import 'firebase/storage';
import 'firebase/firestore';
import { DocumentData } from '@firebase/firestore-types';
import { install } from 'source-map-support';
import { config } from 'dotenv';
import { ReadStream } from 'fs';
import logger from './logger';
import { InternalError } from '../src/common/errors/internal.error';

// Install source-map support for stacktrace
install({ hookRequire: true });
config();

type FilterOperator =
    '<' | '<=' | '==' | '>=' |
    '>' | '!=' | 'array-contains' |
    'array-contains-any' | 'in' | 'not-in';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface CollectionFilter {
    property: string;
    operator: FilterOperator;
    value: string;
}

export enum StoreType {
    PATCH,
    STORE,
    OVERWRITE
}
class Firebase {
    private constructor(
        public readonly firestore: Firestore,
        public readonly storage: Storage) { }

    public static init(): Promise<Firebase> {
        return new Promise((resolve, reject) => {
            const configValue = process.env['FIREBASE_CONFIG'];
            if (!configValue) {
                reject('Environment variable "FIREBASE_CONFIG" not found!');
            }
            const config = JSON.parse(process.env['FIREBASE_CONFIG'] as string);
            const instance = firebase.initializeApp(config);
            const firestore = new Firestore(instance);
            const storage = new Storage(instance);

            resolve(new Firebase(firestore, storage));
        });
    }
}
class Storage {
    private storage: firebase.storage.Storage;

    public constructor(firebase: firebase.app.App) {
        this.storage = firebase.storage();
    }

    public async streamAudio(path: string): Promise<ReadStream> {
        const downloadUrl = await this.storage.ref(path).getDownloadURL();
        const response = await fetch(downloadUrl);
        const buffer = await response.arrayBuffer();
        return new ReadStream({
            read() {
                this.push(buffer);
                this.push(null);
            }
        });
    }

    public async saveAudio(path: string, audio: Buffer): Promise<string> {
        return this.storage.ref(path).put(audio)
            .then((snapshot) => snapshot.ref.getDownloadURL());
    }
}
class Firestore {
    private firestore: firebase.firestore.Firestore;

    public constructor(firebase: firebase.app.App) {
        this.firestore = firebase.firestore();
    }

    public collection(
        path: string
    ): Promise<{
        id: string;
        data: unknown;
    }[]>;

    public collection<T extends DocumentData>(
        path: string
    ): Promise<{
        id: string;
        data: T;
    }[]>;

    public collection<T extends DocumentData>(
        path: string,
        ...defaultValue: {
            id: string;
            data: T;
        }[]): Promise<{
            id: string;
            data: T;
        }[]>;

    public collection<
        T extends DocumentData
    >(
        path: string,
        ...defaultValue: {
            id: string;
            data: T;
        }[]): Promise<{
            id: string;
            data: T;
        }[]> {
        if (path.startsWith('/')) {
            path = path.slice(1);
        }
        return Promise.resolve(this.firestore.collection(path).get())
            .then((ref) => ref.docs)
            .then((docs) => docs.length >= 1 ?
                docs.map((doc) => ({
                    id: doc.id,
                    data: doc.data() as T
                })) :
                Promise.all(
                    defaultValue.map((value) =>
                        this.store<T>(path + value.id, value.data)
                    )
                ).then(() => defaultValue)
            )
            .catch((e: Error) => {
                logger.warn('Failed to get collection docs from db', path, e);
                if (defaultValue.length > 0) {
                    logger.warn('Failed to store collection docs in db', path, e);
                }
                throw new InternalError(e.message);
            });
    }

    public doc(path: string): Promise<unknown>;
    public doc<T extends DocumentData>(path: string): Promise<T | undefined>;
    public doc<T extends DocumentData>(path: string, defaultValue: T): Promise<T>;
    public doc<
        T extends DocumentData | DocumentData[]
    >(path: string, defaultValue?: T): Promise<T | undefined> {
        if (path.startsWith('/')) {
            path = path.slice(1);
        }
        return Promise.resolve(this.firestore.doc(path).get())
            .then((res) => res.data() as T | undefined)
            .then((data) => !data && defaultValue ?
                this.store<T>(path, defaultValue) :
                data
            )
            .catch((e: Error) => {
                logger.warn('Failed to get object from db', path, e);
                if (defaultValue) {
                    logger.warn('Failed to store object in db', path, e);
                }
                throw new InternalError(e.message);
            });
    }

    public store<T extends DocumentData>(
        path: string,
        data: T,
        options: {
            storeType: StoreType;
        } = { storeType: StoreType.STORE }): Promise<T> {
        return Promise.resolve(this.firestore.doc(path))
            .then((ref) => options.storeType === StoreType.STORE ?
                ref.get().then(async (doc) => {
                    if (doc.exists) {
                        throw new InternalError('Doc already exists');
                    } else {
                        return ref.set(data, {
                            merge: options.storeType === StoreType.PATCH
                        });
                    }
                }) : ref.set(data, {
                    merge: options.storeType === StoreType.PATCH
                }))
            .then(() => {
                logger.debug('Stored object in db', path, data);
                return data;
            })
            .catch((e: Error) => {
                logger.warn('Failed to store object in db', path, data, e.message);
                throw new InternalError(e.message);
            });
    }
    public delete(path: string): Promise<void> {
        if (path.startsWith('/')) {
            path = path.slice(1);
        }
        return path.split('/').length % 2 === 0 ?
            Promise.resolve(this.firestore.doc(path).delete())
                .then(() => logger.debug('Deleted db object', path))
                .catch((e: Error) => {
                    logger.warn('Failed to delete db object', path, e);
                    throw new InternalError(e.message);
                }) :
            Promise.resolve(this.firestore.collection(path))
                .then(async (ref) => {
                    const docs = (await ref.get()).docs;
                    await Promise.all(docs.map((doc) => this.delete(doc.ref.path)));
                });
    }
}

export default Firebase;