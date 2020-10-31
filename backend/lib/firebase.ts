import firebase from 'firebase';
import { Observable } from 'rxjs';
import { collectionData, docData } from 'rxfire/firestore';
import { DocumentData } from '@firebase/firestore-types';
import { install } from 'source-map-support';
import { config } from 'dotenv';

// Install source-map support for stacktrace
install({ hookRequire: true });
config();

type FilterOperator =
    '<' | '<=' | '==' | '>=' |
    '>' | '!=' | 'array-contains' |
    'array-contains-any' | 'in' | 'not-in';
interface CollectionFilter {
    property: string;
    operator: FilterOperator;
    value: string;
}
class Firebase {
    private constructor(
        private app: firebase.app.App,
        public readonly firestore: Firestore) { }

    public static init(): Promise<Firebase> {
        return new Promise((resolve, reject) => {
            const configValue = process.env['FIREBASE_CONFIG'];
            if (!configValue) {
                reject('Environment variable "FIREBASE_CONFIG" not found!');
            }
            const config = JSON.parse(process.env['FIREBASE_CONFIG'] as string);
            const instance = firebase.initializeApp(config);
            const firestore = new Firestore(instance);

            resolve(new Firebase(instance, firestore));
        });
    }
}
class Firestore {
    private firestore: firebase.firestore.Firestore;

    public constructor(firebase: firebase.app.App) {
        this.firestore = firebase.firestore();
    }

    public collection<T extends unknown>(
        path: string,
        filter?: CollectionFilter): Observable<T[]> {
        return filter ?
            collectionData(this.firestore.collection(path).where(
                filter.property,
                filter.operator,
                filter.value)) :
            collectionData(this.firestore.collection(path));
    }
    public subscribe<T>(path: string): Observable<T> {
        return docData(this.firestore.doc(path));
    }

    public get<T>(path: string): Promise<T | undefined> {
        return this.firestore.doc(path).get()
            .then((data) => data.data() as T);
    }
    public store<T extends DocumentData>(data: T, path: string): Promise<void> {
        return this.firestore.doc(path).set(data);
    }
    public update<T extends DocumentData>(data: T, path: string): Promise<void> {
        return this.firestore.doc(path).set(data, { merge: true });
    }
    public delete(path: string): Promise<void> {
        return this.firestore.doc(path).delete();
    }
}

export default Firebase;