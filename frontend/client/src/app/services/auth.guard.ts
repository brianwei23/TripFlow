import { inject, Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { Auth } from '@angular/fire/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
    private auth = inject(AuthService);
    private router = inject(Router);
    private firebaseAuth = inject(Auth);

    async canActivate() {
        // Check current user
        return new Promise<boolean>((resolve) => {
            onAuthStateChanged(this.firebaseAuth, (user) => {
                if (user) {
                    resolve(true); // Allow when user is logged in
                } else {
                    this.router.navigate(['/login']);
                    resolve(false);
                }
            });
        });
    }
}