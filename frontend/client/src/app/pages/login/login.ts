import { Component, inject } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

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
        .then(() => this.router.navigate(['/']))
        .catch(err => alert(err.message));
    }
}