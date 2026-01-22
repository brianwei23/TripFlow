import { Injectable } from '@angular/core';
import {
    Auth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut
} from '@angular/fire/auth';

// Globally available service
@Injectable({ providedIn: 'root' })
export class AuthService {

    // Injects Auth service
    constructor(private auth: Auth) {}

    // Create user
    register(email: string, password: string) {
        return createUserWithEmailAndPassword(this.auth, email, password);
    }

    // Login user with email and password
    login(email: string, password: string) {
        return signInWithEmailAndPassword(this.auth, email, password);
    }

    logout() {
        return signOut(this.auth);
    }
}