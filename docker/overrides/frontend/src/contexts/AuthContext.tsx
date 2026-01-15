import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { type User, type RequestAuthCodeResponse } from '../types/api';
import apiClient from '../api/client';

interface LoginWithMobile {
  requestCode: (mobileNumber: string) => Promise<RequestAuthCodeResponse>;
  verifyCode: (mobileNumber: string, authCode: string) => Promise<void>;
}

interface AuthContextType {
  user: User | null;
  login: (email: string) => Promise<void>;
  loginWithMobile: LoginWithMobile;
  logout: () => void;
  isLoading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const storedEmail = localStorage.getItem('userEmail');
      
      if (storedEmail) {
        try {
          const response = await apiClient.getCurrentUser();
          setUser(response.user);
        } catch (error) {
          console.error('Auth check failed:', error);
          localStorage.removeItem('userEmail');
        }
      }
      setIsLoading(false);
    };

    checkAuth();
  }, []);

  const login = async (email: string) => {
    try {
      const response = await apiClient.login(email);
      setUser(response.user);
      localStorage.setItem('userEmail', email);
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  };

  const loginWithMobile: LoginWithMobile = {
    requestCode: async (mobileNumber: string) => {
      try {
        const response = await apiClient.requestAuthCode(mobileNumber);
        return response;
      } catch (error) {
        console.error('Request auth code failed:', error);
        throw error;
      }
    },
    verifyCode: async (mobileNumber: string, authCode: string) => {
      try {
        const response = await apiClient.verifyAuthCode(mobileNumber, authCode);
        setUser(response.user);
        localStorage.setItem('userEmail', response.user.email);
      } catch (error) {
        console.error('Verify auth code failed:', error);
        throw error;
      }
    },
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('userEmail');
  };

  const value: AuthContextType = {
    user,
    login,
    loginWithMobile,
    logout,
    isLoading,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
