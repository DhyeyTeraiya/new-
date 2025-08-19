'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Box, 
  Container, 
  Typography, 
  Button, 
  Stack,
  Card,
  CardContent,
  Chip,
  useTheme,
  alpha
} from '@mui/material';
import { styled } from '@mui/material/styles';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';

const HeroContainer = styled(Box)(({ theme }) => ({
  minHeight: '100vh',
  background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)} 0%, ${alpha(theme.palette.secondary.main, 0.1)} 100%)`,
  position: 'relative',
  overflow: 'hidden',
  display: 'flex',
  alignItems: 'center',
}));

const GradientText = styled(Typography)(({ theme }) => ({
  background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
  fontWeight: 700,
}));

const CTAButton = styled(Button)(({ theme }) => ({
  background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
  color: theme.palette.common.white,
  fontWeight: 600,
  textTransform: 'none',
  borderRadius: theme.shape.borderRadius * 1.5,
  padding: theme.spacing(2, 4),
  fontSize: '1.125rem',
  boxShadow: theme.shadows[3],
  '&:hover': {
    boxShadow: theme.shadows[6],
    transform: 'translateY(-2px)',
  },
  transition: 'all 0.3s ease-in-out',
}));

const OutlineButton = styled(Button)(({ theme }) => ({
  color: theme.palette.primary.main,
  borderColor: theme.palette.primary.main,
  fontWeight: 600,
  textTransform: 'none',
  borderRadius: theme.shape.borderRadius * 1.5,
  padding: theme.spacing(2, 4),
  fontSize: '1.125rem',
  '&:hover': {
    backgroundColor: alpha(theme.palette.primary.main, 0.1),
    borderColor: theme.palette.primary.dark,
  },
  transition: 'all 0.3s ease-in-out',
}));

const FeatureCard = styled(Card)(({ theme }) => ({
  height: '100%',
  borderRadius: theme.shape.borderRadius * 2,
  boxShadow: theme.shadows[1],
  transition: 'all 0.3s ease-in-out',
  '&:hover': {
    boxShadow: theme.shadows[4],
    transform: 'translateY(-4px)',
  },
}));

const BackgroundDecoration = styled(Box)(({ theme }) => ({
  position: 'absolute',
  width: '36rem',
  height: '36rem',
  borderRadius: '50%',
  background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.3)} 0%, ${alpha(theme.palette.secondary.main, 0.3)} 100%)`,
  filter: 'blur(60px)',
  zIndex: -1,
}));

interface StatCardProps {
  label: string;
  value: string;
  color: 'primary' | 'secondary' | 'success' | 'warning';
}

const StatCard: React.FC<StatCardProps> = ({ label, value, color }) => {
  const theme = useTheme();
  
  return (
    <Box sx={{ textAlign: 'center' }}>
      <Typography 
        variant="h3" 
        component="div" 
        sx={{ 
          color: theme.palette[color].main,
          fontWeight: 700,
          mb: 1
        }}
      >
        {value}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
    </Box>
  );
};

export function HeroSection() {
  const theme = useTheme();
  const [currentFeature, setCurrentFeature] = useState(0);

  const features = [
    {
      icon: '🤖',
      title: 'AI-Powered Automation',
      description: 'Natural language commands that translate into precise browser actions. Just tell the AI what you want to do.',
    },
    {
      icon: '👁️',
      title: 'Visual Page Analysis',
      description: 'Advanced computer vision to understand page structure, identify elements, and provide intelligent insights.',
    },
    {
      icon: '🔧',
      title: 'Workflow Builder',
      description: 'Drag-and-drop workflow creation with real-time collaboration and intelligent optimization suggestions.',
    },
  ];

  const stats = [
    { label: 'Success Rate', value: '99.5%', color: 'success' as const },
    { label: 'Speed Boost', value: '10x', color: 'primary' as const },
    { label: 'Cost Savings', value: '75%', color: 'secondary' as const },
    { label: 'Tasks Automated', value: '1M+', color: 'warning' as const },
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentFeature((prev) => (prev + 1) % features.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [features.length]);

  return (
    <HeroContainer>
      {/* Background Decorations */}
      <BackgroundDecoration 
        sx={{ 
          top: '-10%', 
          left: '-10%',
          transform: 'rotate(30deg)',
        }} 
      />
      <BackgroundDecoration 
        sx={{ 
          bottom: '-10%', 
          right: '-10%',
          transform: 'rotate(-30deg)',
        }} 
      />

      <Container maxWidth="xl" sx={{ position: 'relative', zIndex: 1 }}>
        <Stack spacing={8} alignItems="center" textAlign="center">
          {/* Badge */}
          <Chip
            icon={<AutoAwesomeIcon />}
            label="Superior to Manus AI • 5-Agent System"
            variant="outlined"
            sx={{
              borderColor: theme.palette.primary.main,
              color: theme.palette.primary.main,
              backgroundColor: alpha(theme.palette.primary.main, 0.1),
              fontWeight: 500,
            }}
          />

          {/* Main Headline */}
          <Stack spacing={3} alignItems="center">
            <Typography 
              variant="h1" 
              component="h1"
              sx={{ 
                fontSize: { xs: '2.5rem', md: '4rem', lg: '5rem' },
                lineHeight: 1.1,
                maxWidth: '4xl'
              }}
            >
              Intelligent Browser{' '}
              <GradientText variant="h1" component="span" sx={{ fontSize: 'inherit' }}>
                Automation
              </GradientText>
            </Typography>
            
            <Typography 
              variant="h5" 
              color="text.secondary"
              sx={{ 
                maxWidth: '2xl',
                lineHeight: 1.6,
                fontSize: { xs: '1.125rem', md: '1.25rem' }
              }}
            >
              Experience the future of web automation with our AI-powered platform. 
              Automate tasks, analyze pages, and boost productivity with intelligent browser assistance.
            </Typography>
          </Stack>

          {/* CTA Buttons */}
          <Stack 
            direction={{ xs: 'column', sm: 'row' }} 
            spacing={3}
            alignItems="center"
          >
            <CTAButton 
              component={Link} 
              href="/register"
              endIcon={<ChevronRightIcon />}
            >
              Start Free Trial
            </CTAButton>
            <OutlineButton 
              variant="outlined"
              component={Link} 
              href="#demo"
              startIcon={<PlayArrowIcon />}
            >
              Watch Demo
            </OutlineButton>
          </Stack>

          {/* Stats */}
          <Box sx={{ width: '100%', maxWidth: 'lg', mt: 8 }}>
            <Stack 
              direction={{ xs: 'column', sm: 'row' }} 
              spacing={4}
              justifyContent="space-around"
              alignItems="center"
            >
              {stats.map((stat, index) => (
                <StatCard key={index} {...stat} />
              ))}
            </Stack>
          </Box>

          {/* Features Preview */}
          <Box sx={{ width: '100%', maxWidth: 'lg', mt: 8 }}>
            <Typography variant="h4" component="h2" gutterBottom sx={{ mb: 4 }}>
              Powerful AI Features
            </Typography>
            <Stack 
              direction={{ xs: 'column', md: 'row' }} 
              spacing={4}
              justifyContent="center"
            >
              {features.map((feature, index) => (
                <FeatureCard key={index} sx={{ flex: 1 }}>
                  <CardContent sx={{ p: 4, textAlign: 'center' }}>
                    <Box sx={{ fontSize: '3rem', mb: 2 }}>
                      {feature.icon}
                    </Box>
                    <Typography variant="h6" component="h3" gutterBottom>
                      {feature.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {feature.description}
                    </Typography>
                  </CardContent>
                </FeatureCard>
              ))}
            </Stack>
          </Box>

          {/* Trust Indicators */}
          <Box sx={{ mt: 8 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Trusted by 10,000+ professionals worldwide
            </Typography>
            <Stack 
              direction="row" 
              spacing={4} 
              justifyContent="center"
              flexWrap="wrap"
              sx={{ opacity: 0.6, mt: 2 }}
            >
              {['Google', 'Microsoft', 'Amazon', 'Meta', 'Apple'].map((company) => (
                <Typography 
                  key={company}
                  variant="h6" 
                  color="text.secondary"
                  sx={{ 
                    fontWeight: 600,
                    '&:hover': { color: 'text.primary' },
                    transition: 'color 0.2s ease-in-out',
                    cursor: 'pointer'
                  }}
                >
                  {company}
                </Typography>
              ))}
            </Stack>
          </Box>
        </Stack>
      </Container>
    </HeroContainer>
  );
}