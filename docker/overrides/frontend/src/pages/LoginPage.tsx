import React, { useState } from 'react';
import {
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
} from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`login-tabpanel-${index}`}
      aria-labelledby={`login-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
    </div>
  );
}

const LoginPage: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);
  const [email, setEmail] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [step, setStep] = useState<'request' | 'verify'>('request');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login, loginWithMobile } = useAuth();
  const navigate = useNavigate();

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
    setError('');
    setSuccess('');
    setStep('request');
    setAuthCode('');
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(email);
      navigate('/dashboard');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      const response = await loginWithMobile.requestCode(mobileNumber);
      setSuccess(`Auth code sent! Code: ${response.authCode}`);
      setStep('verify');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error.response?.data?.error || 'Failed to send auth code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await loginWithMobile.verifyCode(mobileNumber, authCode);
      navigate('/dashboard');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error.response?.data?.error || 'Verification failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToRequest = () => {
    setStep('request');
    setAuthCode('');
    setError('');
    setSuccess('');
  };

  return (
    <Container component="main" maxWidth="sm">
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          px: 2,
        }}
      >
        <Paper elevation={3} sx={{ padding: 3, width: '100%', maxWidth: 500 }}>
          <Typography component="h1" variant="h4" align="center" gutterBottom>
            Time Tracker
          </Typography>
          <Typography variant="body2" align="center" color="text.secondary" sx={{ mb: 2 }}>
            Choose your login method
          </Typography>

          <Tabs value={tabValue} onChange={handleTabChange} centered sx={{ mb: 2 }}>
            <Tab label="Email" />
            <Tab label="Mobile" />
          </Tabs>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {success && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {success}
            </Alert>
          )}

          <TabPanel value={tabValue} index={0}>
            <Alert severity="info" sx={{ mb: 2 }}>
              This app intentionally does not have a password field.
            </Alert>
            <Box component="form" onSubmit={handleEmailSubmit}>
              <TextField
                margin="normal"
                required
                fullWidth
                id="email"
                label="Email Address"
                name="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
              />
              <Button
                type="submit"
                fullWidth
                variant="contained"
                sx={{ mt: 2, mb: 1 }}
                disabled={isLoading || !email}
              >
                {isLoading ? <CircularProgress size={24} /> : 'Log In with Email'}
              </Button>
            </Box>
          </TabPanel>

          <TabPanel value={tabValue} index={1}>
            {step === 'request' ? (
              <Box component="form" onSubmit={handleRequestCode}>
                <Alert severity="info" sx={{ mb: 2 }}>
                  Enter your mobile number to receive an authentication code.
                </Alert>
                <TextField
                  margin="normal"
                  required
                  fullWidth
                  id="mobileNumber"
                  label="Mobile Number"
                  name="mobileNumber"
                  autoComplete="tel"
                  placeholder="+1234567890"
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value)}
                  disabled={isLoading}
                  helperText="Enter your phone number with country code (e.g., +1234567890)"
                />
                <Button
                  type="submit"
                  fullWidth
                  variant="contained"
                  sx={{ mt: 2, mb: 1 }}
                  disabled={isLoading || !mobileNumber}
                >
                  {isLoading ? <CircularProgress size={24} /> : 'Request Auth Code'}
                </Button>
              </Box>
            ) : (
              <Box component="form" onSubmit={handleVerifyCode}>
                <Alert severity="info" sx={{ mb: 2 }}>
                  Enter the 6-digit code sent to {mobileNumber}
                </Alert>
                <TextField
                  margin="normal"
                  required
                  fullWidth
                  id="authCode"
                  label="Authentication Code"
                  name="authCode"
                  autoComplete="one-time-code"
                  inputProps={{ maxLength: 6, pattern: '[0-9]*' }}
                  value={authCode}
                  onChange={(e) => setAuthCode(e.target.value.replace(/[^0-9]/g, ''))}
                  disabled={isLoading}
                  helperText="Enter the 6-digit code"
                />
                <Button
                  type="submit"
                  fullWidth
                  variant="contained"
                  sx={{ mt: 2, mb: 1 }}
                  disabled={isLoading || authCode.length !== 6}
                >
                  {isLoading ? <CircularProgress size={24} /> : 'Verify Code'}
                </Button>
                <Button
                  fullWidth
                  variant="text"
                  onClick={handleBackToRequest}
                  disabled={isLoading}
                >
                  Back to Mobile Number
                </Button>
              </Box>
            )}
          </TabPanel>
        </Paper>
      </Box>
    </Container>
  );
};

export default LoginPage;
