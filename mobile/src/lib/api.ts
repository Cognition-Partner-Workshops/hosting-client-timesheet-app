const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface User {
  email: string;
  created_at: string;
}

interface LoginResponse {
  message: string;
  user: User;
}

interface ApiError {
  error: string;
}

class ApiClient {
  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    if (typeof window !== 'undefined') {
      const userEmail = localStorage.getItem('userEmail');
      if (userEmail) {
        headers['x-user-email'] = userEmail;
      }
    }
    
    return headers;
  }

  async login(email: string): Promise<LoginResponse> {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      const errorData: ApiError = await response.json();
      throw new Error(errorData.error || 'Login failed');
    }

    const data: LoginResponse = await response.json();
    
    if (typeof window !== 'undefined') {
      localStorage.setItem('userEmail', email);
    }
    
    return data;
  }

  async getCurrentUser(): Promise<{ user: User }> {
    const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      if (response.status === 401) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('userEmail');
        }
      }
      const errorData: ApiError = await response.json();
      throw new Error(errorData.error || 'Failed to get user');
    }

    return response.json();
  }

  logout(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('userEmail');
    }
  }
}

export const apiClient = new ApiClient();
export type { User, LoginResponse };
