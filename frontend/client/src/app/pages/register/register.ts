import { Component } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import Swal from 'sweetalert2';
import { Toast } from '../../notifications';

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
      Toast.fire({
        icon: 'warning',
        title: 'Weak Password',
        text: 'Password must have at least 7 characters and have uppercase, lowercase, numbers, and symbols.'
      });
      return;
    }
    // Calling Firebase Auth
    this.auth.register(this.email, this.password)
      .then(() => {
        Toast.fire({
          icon: 'success',
          title: 'Verification email sent!',
        });
        this.router.navigate(['/login']);
      })
      .catch(error => {
        // Duplicate email check
        if (error.code === 'auth/email-already-in-use') {
          Toast.fire({
            icon: 'error',
            title: 'Duplicate Email',
            text: 'Email already used with another account.'
          });
          return;
        }
        Toast.fire({
          icon: 'error',
          title: 'Registration Failed',
          text: error.message
        });
      });
  }
}
