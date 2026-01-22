import { Component } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

@Component({
    selector: 'app-login',
    standalone: true,
    imports: [FormsModule],
    templateUrl: './login.html',
    styleUrls: ['./login.css']
})

export class LoginComponent {
    email = '';
    password = '';

    constructor(private auth: AuthService, private router: Router) {}

    login(){
        this.auth.login(this.email, this.password)
        .then(() => this.router.navigate(['/']))
        .catch(err => alert(err.message));
    }
}