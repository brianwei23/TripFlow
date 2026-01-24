import { Injectable } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    UserCredential,
    sendEmailVerification
} from 'firebase/auth';

// Globally available service
@Injectable({ providedIn: 'root' })
export class AuthService {

    constructor(private auth: Auth) {}

    // Create user
    async register(email: string, password: string): Promise<UserCredential> {
        // Account creation
        const cred = await createUserWithEmailAndPassword(this.auth, email, password);

        await sendEmailVerification(cred.user);

        return cred;
    }

    // Login user with email and password
    login(email: string, password: string): Promise<UserCredential> {
        return signInWithEmailAndPassword(this.auth, email, password);
    }

    logout(): Promise<void> {
        return signOut(this.auth);
    }
}