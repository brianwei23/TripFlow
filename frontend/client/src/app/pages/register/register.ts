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

  // Password strength: Must have at least 7 chars, and have lower/uppercase, number, and symbol
  private passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{7,}$/;

  register() {
    // Check password strength
    if (!this.passwordRegex.test(this.password)) {
      alert(
        'Password must have at least 7 characters and include:\n' + '• one uppercase letter\n' + '• one lowercase letter\n' + '• one number\n' + '• one special character'
      );
      return;
    }
    // Calling Firebase Auth
    this.auth.register(this.email, this.password)
      .then(() => {
        alert('An email has been sent to your address for verification.');
        this.router.navigate(['/login']);
      })
      .catch(error => {
        // Duplicate email check
        if (error.code === 'auth/email-already-in-use') {
          alert('An account associated with this email already exists.');
          return;
        }
        alert(error.message);
      });
  }
}
