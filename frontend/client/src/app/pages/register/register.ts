import { Component } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-register',
  imports: [FormsModule, RouterLink],
  standalone: true,
  templateUrl: './register.html',
  styleUrls: ['./register.css'],
})
export class RegisterComponent {
  email = '';
  password = '';

  constructor(private auth: AuthService, private router: Router) {}

  register() {
    this.auth.register(this.email, this.password)
      .then(() => this.router.navigate(['/']))
      .catch(err => alert(err.message));
  }
}
