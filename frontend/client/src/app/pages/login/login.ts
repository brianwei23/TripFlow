import { Component, inject } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import Swal from 'sweetalert2';
import { Toast } from '../../notifications';

@Component({
    selector: 'app-login',
    standalone: true,
    imports: [FormsModule, RouterLink],
    templateUrl: './login.html',
    styleUrls: ['./login.css']
})

export class LoginComponent {
    email = '';
    password = '';

    private authService = inject(AuthService);
    private router = inject(Router);

    login(){
        this.authService.login(this.email, this.password)
            .then((cred) => {
            // If email not verified, then don't allow login.
            if (!cred.user.emailVerified) {
                Toast.fire({
                    icon: 'warning',
                    title: 'Please verify your email first.',
                });
                return;
            }
            // If email verified, then go to home page. 
            this.router.navigate(['/home']);
        })
        .catch(err => {
            Toast.fire({
                icon: 'error',
                title: 'Invalid or missing credentials'
            });
        });
    }
}