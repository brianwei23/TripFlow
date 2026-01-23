import { Injectable } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    UserCredential
} from 'firebase/auth';

// Globally available service
@Injectable({ providedIn: 'root' })
export class AuthService {

    constructor(private auth: Auth) {}

    // Create user
    register(email: string, password: string): Promise<UserCredential> {
        return createUserWithEmailAndPassword(this.auth, email, password);
    }

    // Login user with email and password
    login(email: string, password: string): Promise<UserCredential> {
        return signInWithEmailAndPassword(this.auth, email, password);
    }

    logout(): Promise<void> {
        return signOut(this.auth);
    }
}