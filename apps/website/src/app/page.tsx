'use client';

import { useState } from 'react';
import Link from 'next/link';
import { 
  Box, 
  Container, 
  Typography, 
  Button, 
  Stack,
  Paper,
  Divider
} from '@mui/material';
import { styled } from '@mui/material/styles';
import { Navigation } from '@/components/Navigation';
import { HeroSection } from '@/components/HeroSection';
import { AIChatWidget } from '@/components/AIChatWidget';

const CTASection = styled(Box)(({ theme }) => ({
  background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
  color: theme.palette.common.white,
  padding: theme.spacing(12, 0),
}));

const FooterSection = styled(Paper)(({ theme }) => ({
  backgroundColor: theme.palette.background.paper,
  padding: theme.spacing(6, 0),
  marginTop: 'auto',
}));

const CTAButton = styled(Button)(({ theme }) => ({
  backgroundColor: theme.palette.common.white,
  color: theme.palette.primary.main,
  fontWeight: 600,
  textTransform: 'none',
  borderRadius: theme.shape.borderRadius * 1.5,
  padding: theme.spacing(1.5, 4),
  '&:hover': {
    backgroundColor: theme.palette.grey[100],
    transform: 'translateY(-1px)',
  },
  transition: 'all 0.2s ease-in-out',
}));

export default function HomePage() {
  const [isChatOpen, setIsChatOpen] = useState(false);

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Navigation */}
      <Navigation />

      {/* Hero Section */}
      <HeroSection />

      {/* CTA Section */}
      <CTASection>
        <Container maxWidth="lg">
          <Stack spacing={4} alignItems="center" textAlign="center">
            <Typography variant="h3" component="h2" fontWeight={700}>
              Ready to automate your workflow?
            </Typography>
            <Typography 
              variant="h6" 
              sx={{ 
                maxWidth: 'md',
                opacity: 0.9,
                lineHeight: 1.6
              }}
            >
              Join thousands of users who are already saving time with intelligent browser automation.
            </Typography>
            <Stack 
              direction={{ xs: 'column', sm: 'row' }} 
              spacing={3}
              alignItems="center"
            >
              <CTAButton 
                component={Link} 
                href="/register"
                size="large"
              >
                Get started for free
              </CTAButton>
              <Button 
                component={Link} 
                href="/contact"
                variant="text"
                sx={{ 
                  color: 'inherit',
                  fontWeight: 600,
                  textTransform: 'none',
                  '&:hover': {
                    backgroundColor: 'rgba(255,255,255,0.1)',
                  }
                }}
              >
                Contact sales →
              </Button>
            </Stack>
          </Stack>
        </Container>
      </CTASection>

      {/* Footer */}
      <FooterSection elevation={0}>
        <Container maxWidth="lg">
          <Stack 
            direction={{ xs: 'column', md: 'row' }} 
            justifyContent="space-between"
            alignItems="center"
            spacing={2}
          >
            <Typography variant="body2" color="text.secondary">
              Built with ❤️ by the AI Website Team
            </Typography>
            <Typography variant="body2" color="text.secondary">
              © 2024 AI Website. All rights reserved.
            </Typography>
          </Stack>
        </Container>
      </FooterSection>

      {/* AI Chat Widget */}
      <AIChatWidget 
        isOpen={isChatOpen} 
        onToggle={() => setIsChatOpen(!isChatOpen)} 
      />
    </Box>
  );
}