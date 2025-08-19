'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Stack,
  Avatar,
  Chip,
  Fab,
  Collapse,
  IconButton,
  Divider,
  CircularProgress,
} from '@mui/material';
import { styled } from '@mui/material/styles';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import SendIcon from '@mui/icons-material/Send';
import CloseIcon from '@mui/icons-material/Close';
import PersonIcon from '@mui/icons-material/Person';
import { useAuth } from '@/contexts/auth-context';
import { useSocket } from '@/contexts/socket-context';

interface Message {
  id: string;
  content: string;
  type: 'user' | 'assistant';
  timestamp: Date;
}

interface AIChatWidgetProps {
  isOpen: boolean;
  onToggle: () => void;
}

const ChatContainer = styled(Paper)(({ theme }) => ({
  position: 'fixed',
  bottom: theme.spacing(10),
  right: theme.spacing(3),
  width: 384,
  height: 500,
  borderRadius: theme.shape.borderRadius * 2,
  boxShadow: theme.shadows[8],
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  zIndex: 1300,
}));

const ChatHeader = styled(Box)(({ theme }) => ({
  background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
  color: theme.palette.common.white,
  padding: theme.spacing(2),
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
}));

const MessagesContainer = styled(Box)(({ theme }) => ({
  flex: 1,
  overflowY: 'auto',
  padding: theme.spacing(2),
  backgroundColor: theme.palette.grey[50],
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(2),
}));

const UserMessage = styled(Paper)(({ theme }) => ({
  backgroundColor: theme.palette.primary.main,
  color: theme.palette.common.white,
  padding: theme.spacing(1.5, 2),
  borderRadius: theme.shape.borderRadius * 2,
  borderBottomRightRadius: theme.shape.borderRadius * 0.5,
  maxWidth: '80%',
  alignSelf: 'flex-end',
  wordWrap: 'break-word',
}));

const AssistantMessage = styled(Paper)(({ theme }) => ({
  backgroundColor: theme.palette.common.white,
  color: theme.palette.text.primary,
  padding: theme.spacing(1.5, 2),
  borderRadius: theme.shape.borderRadius * 2,
  borderBottomLeftRadius: theme.shape.borderRadius * 0.5,
  maxWidth: '80%',
  alignSelf: 'flex-start',
  wordWrap: 'break-word',
  boxShadow: theme.shadows[1],
}));

const QuickActionButton = styled(Button)(({ theme }) => ({
  textTransform: 'none',
  justifyContent: 'flex-start',
  borderRadius: theme.shape.borderRadius,
  padding: theme.spacing(1, 1.5),
  fontSize: '0.75rem',
  backgroundColor: theme.palette.grey[100],
  color: theme.palette.text.primary,
  '&:hover': {
    backgroundColor: theme.palette.grey[200],
  },
}));

const ChatFab = styled(Fab)(({ theme }) => ({
  position: 'fixed',
  bottom: theme.spacing(3),
  right: theme.spacing(3),
  background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
  color: theme.palette.common.white,
  '&:hover': {
    transform: 'scale(1.05)',
  },
  transition: 'all 0.2s ease-in-out',
}));

export function AIChatWidget({ isOpen, onToggle }: AIChatWidgetProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      content: "👋 Hello! I'm your AI assistant. I can help you with browser automation, page analysis, and workflow creation. What would you like me to help you with?",
      type: 'assistant',
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user, isAuthenticated } = useAuth();
  const { emit } = useSocket();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    if (!isAuthenticated) {
      // Show error message
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputValue,
      type: 'user',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      // Simulate API call
      setTimeout(() => {
        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: "I understand you'd like help with that. This is a demo response. In a real implementation, this would connect to your AI backend service.",
          type: 'assistant',
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, aiMessage]);
        setIsLoading(false);
      }, 1500);
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessages(prev => prev.filter(msg => msg.id !== userMessage.id));
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const quickActions = [
    { label: '🔍 Analyze this page', action: 'analyze' },
    { label: '📊 Extract data', action: 'extract' },
    { label: '🤖 Create workflow', action: 'workflow' },
    { label: '❓ Help me get started', action: 'help' },
  ];

  const handleQuickAction = (action: string) => {
    const actionMessages: Record<string, string> = {
      analyze: 'Please analyze this page for me',
      extract: 'Help me extract data from this page',
      workflow: 'I want to create an automation workflow',
      help: 'What can you help me with?',
    };

    setInputValue(actionMessages[action] || '');
  };

  return (
    <>
      <Collapse in={isOpen} timeout={300}>
        <ChatContainer>
          {/* Header */}
          <ChatHeader>
            <Stack direction="row" spacing={2} alignItems="center">
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'rgba(255,255,255,0.2)' }}>
                <SmartToyIcon fontSize="small" />
              </Avatar>
              <Box>
                <Typography variant="subtitle2" fontWeight={600}>
                  AI Assistant
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.9 }}>
                  Online • Ready to help
                </Typography>
              </Box>
            </Stack>
            <IconButton 
              onClick={onToggle}
              sx={{ 
                color: 'inherit',
                bgcolor: 'rgba(255,255,255,0.2)',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' }
              }}
              size="small"
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </ChatHeader>

          {/* Messages */}
          <MessagesContainer>
            {messages.map((message) => (
              <Box key={message.id}>
                {message.type === 'user' ? (
                  <UserMessage elevation={0}>
                    <Typography variant="body2">
                      {message.content}
                    </Typography>
                    <Typography variant="caption" sx={{ opacity: 0.8, mt: 0.5, display: 'block' }}>
                      {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Typography>
                  </UserMessage>
                ) : (
                  <Box>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                      <Avatar sx={{ width: 20, height: 20, bgcolor: 'primary.main' }}>
                        <SmartToyIcon sx={{ fontSize: 12 }} />
                      </Avatar>
                      <Typography variant="caption" color="text.secondary" fontWeight={500}>
                        AI Assistant
                      </Typography>
                    </Stack>
                    <AssistantMessage>
                      <Typography variant="body2">
                        {message.content}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Typography>
                    </AssistantMessage>
                  </Box>
                )}
              </Box>
            ))}
            
            {isLoading && (
              <Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <Avatar sx={{ width: 20, height: 20, bgcolor: 'primary.main' }}>
                    <SmartToyIcon sx={{ fontSize: 12 }} />
                  </Avatar>
                  <Typography variant="caption" color="text.secondary" fontWeight={500}>
                    AI Assistant
                  </Typography>
                </Stack>
                <AssistantMessage>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <CircularProgress size={16} />
                    <Typography variant="body2" color="text.secondary">
                      Thinking...
                    </Typography>
                  </Stack>
                </AssistantMessage>
              </Box>
            )}
            
            <div ref={messagesEndRef} />
          </MessagesContainer>

          {/* Quick Actions */}
          {messages.length <= 1 && (
            <Box sx={{ p: 2, bgcolor: 'background.paper' }}>
              <Divider sx={{ mb: 2 }} />
              <Stack spacing={1}>
                {quickActions.map((action) => (
                  <QuickActionButton
                    key={action.action}
                    onClick={() => handleQuickAction(action.action)}
                    size="small"
                    fullWidth
                  >
                    {action.label}
                  </QuickActionButton>
                ))}
              </Stack>
            </Box>
          )}

          {/* Input */}
          <Box sx={{ p: 2, bgcolor: 'background.paper', borderTop: 1, borderColor: 'divider' }}>
            <Stack direction="row" spacing={1}>
              <TextField
                fullWidth
                size="small"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={isAuthenticated ? "Type your message..." : "Sign in to chat..."}
                disabled={!isAuthenticated || isLoading}
                variant="outlined"
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
                  },
                }}
              />
              <Button
                onClick={sendMessage}
                disabled={!inputValue.trim() || isLoading || !isAuthenticated}
                variant="contained"
                sx={{ 
                  minWidth: 'auto',
                  px: 2,
                  borderRadius: 2,
                }}
              >
                <SendIcon fontSize="small" />
              </Button>
            </Stack>
          </Box>
        </ChatContainer>
      </Collapse>

      {/* Toggle Button */}
      <ChatFab onClick={onToggle}>
        {isOpen ? <CloseIcon /> : <SmartToyIcon />}
      </ChatFab>
    </>
  );
}