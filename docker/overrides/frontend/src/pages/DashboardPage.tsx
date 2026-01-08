import React from 'react';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  Paper,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
} from '@mui/material';
import {
  Business as BusinessIcon,
  Assignment as AssignmentIcon,
  Assessment as AssessmentIcon,
  Add as AddIcon,
  AccessTime as AccessTimeIcon,
  Warning as WarningIcon,
  Schedule as ScheduleIcon,
  TrendingUp as TrendingUpIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../api/client';

interface TimeStats {
  hoursToday: number;
  hoursThisWeek: number;
  hoursThisMonth: number;
}

interface DashboardStats {
  timeStats: TimeStats;
  summary: {
    totalClients: number;
    totalEntries: number;
  };
}

interface Defaulter {
  id: number;
  name: string;
  description: string | null;
  lastEntryDate: string | null;
  totalHours: number;
  daysSinceLastEntry: number | null;
}

interface RecentEntry {
  id: number;
  clientId: number;
  clientName: string;
  hours: number;
  description: string | null;
  date: string;
  createdAt: string;
}

interface UpcomingClient {
  id: number;
  name: string;
  description: string | null;
  lastEntryDate: string | null;
  totalHours: number;
  entryCount: number;
}

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();

  const { data: statsData } = useQuery<DashboardStats>({
    queryKey: ['dashboardStats'],
    queryFn: () => apiClient.getDashboardStats(),
  });

  const { data: defaultersData } = useQuery<{ defaulters: Defaulter[]; count: number }>({
    queryKey: ['dashboardDefaulters'],
    queryFn: () => apiClient.getDashboardDefaulters(),
  });

  const { data: dueDatesData } = useQuery<{ recentEntries: RecentEntry[]; upcomingClients: UpcomingClient[] }>({
    queryKey: ['dashboardDueDates'],
    queryFn: () => apiClient.getDashboardDueDates(),
  });

  const timeStats = statsData?.timeStats || { hoursToday: 0, hoursThisWeek: 0, hoursThisMonth: 0 };
  const summary = statsData?.summary || { totalClients: 0, totalEntries: 0 };
  const defaulters = defaultersData?.defaulters || [];
  const recentEntries = dueDatesData?.recentEntries || [];
  const upcomingClients = dueDatesData?.upcomingClients || [];

  const timeCards = [
    {
      title: 'Hours Today',
      value: timeStats.hoursToday.toFixed(1),
      icon: <AccessTimeIcon />,
      color: '#1976d2',
    },
    {
      title: 'Hours This Week',
      value: timeStats.hoursThisWeek.toFixed(1),
      icon: <TrendingUpIcon />,
      color: '#388e3c',
    },
    {
      title: 'Hours This Month',
      value: timeStats.hoursThisMonth.toFixed(1),
      icon: <AssessmentIcon />,
      color: '#f57c00',
    },
  ];

  const summaryCards = [
    {
      title: 'Total Clients',
      value: summary.totalClients,
      icon: <BusinessIcon />,
      color: '#9c27b0',
      action: () => navigate('/clients'),
    },
    {
      title: 'Total Entries',
      value: summary.totalEntries,
      icon: <AssignmentIcon />,
      color: '#00bcd4',
      action: () => navigate('/work-entries'),
    },
  ];

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>

      <Typography variant="h6" sx={{ mb: 2, color: 'text.secondary' }}>
        Time Tracking
      </Typography>
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {timeCards.map((stat, index) => (
          // @ts-expect-error - MUI Grid item prop type issue
          <Grid item xs={12} sm={6} md={4} key={index}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" justifyContent="space-between" gap={3}>
                  <Box>
                    <Typography color="textSecondary" gutterBottom variant="body2">
                      {stat.title}
                    </Typography>
                    <Typography variant="h4" component="div">
                      {stat.value}
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      backgroundColor: stat.color,
                      borderRadius: 1,
                      p: 1,
                      color: 'white',
                      flexShrink: 0,
                    }}
                  >
                    {stat.icon}
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        {summaryCards.map((stat, index) => (
          // @ts-expect-error - MUI Grid item prop type issue
          <Grid item xs={12} sm={6} key={index}>
            <Card
              sx={{
                cursor: 'pointer',
                transition: 'transform 0.2s',
                '&:hover': {
                  transform: 'translateY(-4px)',
                },
              }}
              onClick={stat.action}
            >
              <CardContent>
                <Box display="flex" alignItems="center" justifyContent="space-between" gap={3}>
                  <Box>
                    <Typography color="textSecondary" gutterBottom variant="body2">
                      {stat.title}
                    </Typography>
                    <Typography variant="h4" component="div">
                      {stat.value}
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      backgroundColor: stat.color,
                      borderRadius: 1,
                      p: 1,
                      color: 'white',
                      flexShrink: 0,
                    }}
                  >
                    {stat.icon}
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3}>
        {/* @ts-expect-error - MUI Grid item prop type issue */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Box display="flex" alignItems="center" gap={1} mb={2}>
              <WarningIcon color="warning" />
              <Typography variant="h6">Defaulters</Typography>
              <Chip 
                label={defaulters.length} 
                size="small" 
                color={defaulters.length > 0 ? 'warning' : 'success'}
              />
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Clients without time entries in the last 7 days
            </Typography>
            <Divider sx={{ mb: 2 }} />
            {defaulters.length > 0 ? (
              <List dense>
                {defaulters.slice(0, 5).map((defaulter) => (
                  <ListItem 
                    key={defaulter.id}
                    sx={{ 
                      cursor: 'pointer',
                      '&:hover': { backgroundColor: 'action.hover' },
                      borderRadius: 1,
                    }}
                    onClick={() => navigate('/work-entries')}
                  >
                    <ListItemIcon>
                      <BusinessIcon color="warning" />
                    </ListItemIcon>
                    <ListItemText
                      primary={defaulter.name}
                      secondary={
                        defaulter.lastEntryDate
                          ? `Last entry: ${new Date(defaulter.lastEntryDate).toLocaleDateString()} (${defaulter.daysSinceLastEntry} days ago)`
                          : 'No entries yet'
                      }
                    />
                  </ListItem>
                ))}
              </List>
            ) : (
              <Typography color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                All clients have recent entries
              </Typography>
            )}
            {defaulters.length > 5 && (
              <Button 
                variant="text" 
                fullWidth 
                onClick={() => navigate('/clients')}
                sx={{ mt: 1 }}
              >
                View all {defaulters.length} defaulters
              </Button>
            )}
          </Paper>
        </Grid>

        {/* @ts-expect-error - MUI Grid item prop type issue */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Box display="flex" alignItems="center" gap={1} mb={2}>
              <ScheduleIcon color="primary" />
              <Typography variant="h6">Recent Activity</Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Latest time entries from the past week
            </Typography>
            <Divider sx={{ mb: 2 }} />
            {recentEntries.length > 0 ? (
              <List dense>
                {recentEntries.slice(0, 5).map((entry) => (
                  <ListItem 
                    key={entry.id}
                    sx={{ 
                      cursor: 'pointer',
                      '&:hover': { backgroundColor: 'action.hover' },
                      borderRadius: 1,
                    }}
                    onClick={() => navigate('/work-entries')}
                  >
                    <ListItemIcon>
                      <AssignmentIcon color="primary" />
                    </ListItemIcon>
                    <ListItemText
                      primary={`${entry.clientName} - ${entry.hours}h`}
                      secondary={`${new Date(entry.date).toLocaleDateString()}${entry.description ? ` - ${entry.description.substring(0, 30)}${entry.description.length > 30 ? '...' : ''}` : ''}`}
                    />
                  </ListItem>
                ))}
              </List>
            ) : (
              <Typography color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                No recent entries
              </Typography>
            )}
          </Paper>
        </Grid>
      </Grid>

      <Grid container spacing={3} sx={{ mt: 1 }}>
        {/* @ts-expect-error - MUI Grid item prop type issue */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3 }}>
            <Box display="flex" alignItems="center" gap={1} mb={2}>
              <BusinessIcon color="info" />
              <Typography variant="h6">Client Overview</Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Your active clients and their total hours
            </Typography>
            <Divider sx={{ mb: 2 }} />
            {upcomingClients.length > 0 ? (
              <List dense>
                {upcomingClients.map((client) => (
                  <ListItem 
                    key={client.id}
                    sx={{ 
                      cursor: 'pointer',
                      '&:hover': { backgroundColor: 'action.hover' },
                      borderRadius: 1,
                    }}
                    onClick={() => navigate('/clients')}
                  >
                    <ListItemIcon>
                      <BusinessIcon color="info" />
                    </ListItemIcon>
                    <ListItemText
                      primary={client.name}
                      secondary={`${client.totalHours.toFixed(1)} total hours | ${client.entryCount} entries${client.lastEntryDate ? ` | Last: ${new Date(client.lastEntryDate).toLocaleDateString()}` : ''}`}
                    />
                  </ListItem>
                ))}
              </List>
            ) : (
              <Typography color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                No clients yet
              </Typography>
            )}
          </Paper>
        </Grid>

        {/* @ts-expect-error - MUI Grid item prop type issue */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" mb={2}>
              Quick Actions
            </Typography>
            <Box display="flex" flexDirection="column" gap={2}>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => navigate('/clients')}
                fullWidth
              >
                Add Client
              </Button>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => navigate('/work-entries')}
                fullWidth
              >
                Add Work Entry
              </Button>
              <Button
                variant="outlined"
                startIcon={<AssessmentIcon />}
                onClick={() => navigate('/reports')}
                fullWidth
              >
                View Reports
              </Button>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default DashboardPage;
