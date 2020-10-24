import { initializeApp } from 'firebase';
import { app } from 'firebase/app';
import { Observable } from 'rxjs';
import logger from './logger';


class Firebase {
    private firebase?: app.App;
    constructor() {
        try {
            this.firebase = initializeApp(JSON.parse(process.env.FIREBASE_CONFIG as string));
        } catch {
            logger.error('Unable to initialize firebase! Check the README to learn how to setup the firebase config.');
        }
    }

    public get<T extends unknown>(): Observable<T> {
        
    }
}