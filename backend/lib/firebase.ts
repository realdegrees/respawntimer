import firebase from 'firebase';
import { Observable } from 'rxjs';
import { collectionData, docData } from 'rxfire/firestore';
import { DocumentData } from '@firebase/firestore-types';

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
    private _firebase: firebase.app.App;
    private _firestore!: Firestore;

    public constructor() {
        const config = JSON.parse(process.env['FIREBASE_CONFIG'] as string);
        this._firebase = firebase.initializeApp(config);

    }

    public init(): Promise<void> {
        return new Promise((resolve, reject) => {
            const configValue = process.env['FIREBASE_CONFIG'];
            if (!configValue) {
                reject('Environment variable "FIREBASE_CONFIG" not found!');
            }
            try {
                const config = JSON.parse(process.env['FIREBASE_CONFIG'] as string);
                this._firebase = firebase.initializeApp(config);
                this._firestore = new Firestore(this._firebase);
            }catch(error){
                reject(error);
            }
        });
    }

    public get firestore(): Firestore {
        return this._firestore;
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
    public doc<T extends unknown>(path: string): Observable<T> {
        return docData(this.firestore.doc(path));
    }

    public store(data: DocumentData, path: string): Promise<void> {
        return this.firestore.doc(path).set(data);
    }
}

export default new Firebase();