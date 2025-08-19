'use client';

import React from 'react';
import Link from 'next/link';
import { 
  AppBar, 
  Toolbar, 
  Typography, 
  Button, 
  Box, 
  Container,
  Stack
} from '@mui/material';
import { styled } from '@mui/material/styles';

const GradientText = styled(Typography)(({ theme }) => ({
  background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
  fontWeight: 700,
}));

const NavButton = styled(Button)(({ theme }) => ({
  color: theme.palette.text.secondary,
  fontWeight: 500,
  textTransform: 'none',
  '&:hover': {
    color: theme.palette.text.primary,
    backgroundColor: 'transparent',
  },
}));

const CTAButton = styled(Button)(({ theme }) => ({
  background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
  color: theme.palette.common.white,
  fontWeight: 600,
  textTransform: 'none',
  borderRadius: theme.shape.borderRadius * 1.5,
  padding: theme.spacing(1.5, 3),
  boxShadow: theme.shadows[2],
  '&:hover': {
    boxShadow: theme.shadows[4],
    transform: 'translateY(-1px)',
  },
  transition: 'all 0.2s ease-in-out',
}));

export function Navigation() {
  return (
    <AppBar 
      position="sticky" 
      elevation={0}
      sx={{ 
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        backdropFilter: 'blur(10px)',
        borderBottom: 1,
        borderColor: 'grey.200'
      }}
    >
      <Container maxWidth="xl">
        <Toolbar sx={{ justifyContent: 'space-between', py: 1 }}>
          <GradientText variant="h5" component="div">
            AI Website
          </GradientText>
          
          <Box sx={{ display: { xs: 'none', md: 'flex' } }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <NavButton component={Link} href="#features">
                Features
              </NavButton>
              <NavButton component={Link} href="#pricing">
                Pricing
              </NavButton>
              <NavButton component={Link} href="#about">
                About
              </NavButton>
              <CTAButton component={Link} href="/login">
                Get Started
              </CTAButton>
            </Stack>
          </Box>
        </Toolbar>
      </Container>
    </AppBar>
  );
}