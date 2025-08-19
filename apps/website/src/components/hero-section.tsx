'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRightIcon, PlayIcon, SparklesIcon } from '@heroicons/react/24/outline';

// =============================================================================
// PREMIUM HERO SECTION (Superior to Manus Landing Page)
// Master Plan: Interactive demos, 3D animations, conversion optimization
// =============================================================================

interface AnimatedStat {
  label: string;
  value: string;
  suffix: string;
  color: string;
}

interface FeatureDemo {
  id: string;
  title: string;
  description: string;
  icon: string;
  preview: string;
  color: string;
}

const HeroSection = () => {
  const [currentDemo, setCurrentDemo] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [animatedStats, setAnimatedStats] = useState<AnimatedStat[]>([]);

  const stats: AnimatedStat[] = [
    { label: 'Success Rate', value: '99.5', suffix: '%', color: 'text-green-400' },
    { label: 'Speed Boost', value: '10', suffix: 'x', color: 'text-blue-400' },
    { label: 'Cost Savings', value: '75', suffix: '%', color: 'text-purple-400' },
    { label: 'Tasks Automated', value: '1M', suffix: '+', color: 'text-orange-400' },
  ];

  const featureDemos: FeatureDemo[] = [
    {
      id: 'job-search',
      title: 'AI Job Search',
      description: 'Find and apply to 100+ jobs in minutes with our 5-agent AI system',
      icon: '🎯',
      preview: '/demos/job-search.mp4',
      color: 'from-blue-500 to-cyan-500',
    },
    {
      id: 'data-extraction',
      title: 'Smart Data Extraction',
      description: 'Extract structured data from any website with 99.5% accuracy',
      icon: '📊',
      preview: '/demos/data-extraction.mp4',
      color: 'from-purple-500 to-pink-500',
    },
    {
      id: 'form-automation',
      title: 'Form Automation',
      description: 'Fill complex forms automatically with human-like precision',
      icon: '📝',
      preview: '/demos/form-automation.mp4',
      color: 'from-green-500 to-emerald-500',
    },
  ];

  useEffect(() => {
    // Animate stats on mount
    const timer = setTimeout(() => {
      setAnimatedStats(stats);
    }, 500);

    // Auto-rotate demos
    const demoTimer = setInterval(() => {
      setCurrentDemo((prev) => (prev + 1) % featureDemos.length);
    }, 5000);

    return () => {
      clearTimeout(timer);
      clearInterval(demoTimer);
    };
  }, []);

  const handlePlayDemo = () => {
    setIsPlaying(true);
    // Would trigger actual demo playback
    setTimeout(() => setIsPlaying(false), 3000);
  };

  return (
    <section className="relative min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]" />
        <motion.div
          className="absolute top-1/4 left-1/4 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20"
          animate={{
            x: [0, 100, 0],
            y: [0, -100, 0],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "linear",
          }}
        />
        <motion.div
          className="absolute top-1/3 right-1/4 w-72 h-72 bg-cyan-500 rounded-full mix-blend-multiply filter blur-xl opacity-20"
          animate={{
            x: [0, -100, 0],
            y: [0, 100, 0],
          }}
          transition={{
            duration: 25,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
        <div className="grid lg:grid-cols-2 gap-12 items-center min-h-[80vh]">
          {/* Left Column - Content */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="space-y-8"
          >
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="inline-flex items-center px-4 py-2 rounded-full bg-gradient-to-r from-purple-500/10 to-cyan-500/10 border border-purple-500/20 backdrop-blur-sm"
            >
              <SparklesIcon className="w-4 h-4 text-purple-400 mr-2" />
              <span className="text-sm font-medium text-purple-300">
                Superior to Manus AI • 5-Agent System
              </span>
            </motion.div>

            {/* Main Headline */}
            <div className="space-y-4">
              <motion.h1
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.8 }}
                className="text-5xl lg:text-7xl font-bold leading-tight"
              >
                <span className="bg-gradient-to-r from-white via-purple-200 to-cyan-200 bg-clip-text text-transparent">
                  World's Most
                </span>
                <br />
                <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent">
                  Intelligent
                </span>
                <br />
                <span className="text-white">
                  Browser AI Agent
                </span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.6 }}
                className="text-xl lg:text-2xl text-slate-300 leading-relaxed max-w-2xl"
              >
                Automate any web task with our revolutionary 5-agent AI system. 
                <span className="text-purple-300 font-semibold"> 10x faster</span> than manual work,
                <span className="text-cyan-300 font-semibold"> 99.5% reliable</span>, and
                <span className="text-green-300 font-semibold"> 75% cheaper</span> than competitors.
              </motion.p>
            </div>

            {/* CTA Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, duration: 0.6 }}
              className="flex flex-col sm:flex-row gap-4"
            >
              <motion.button
                whileHover={{ scale: 1.05, boxShadow: "0 20px 40px rgba(139, 92, 246, 0.3)" }}
                whileTap={{ scale: 0.95 }}
                className="group relative px-8 py-4 bg-gradient-to-r from-purple-600 to-cyan-600 rounded-xl font-semibold text-white shadow-lg hover:shadow-purple-500/25 transition-all duration-300"
              >
                <span className="relative z-10 flex items-center justify-center">
                  Start Free Trial
                  <ChevronRightIcon className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-cyan-600 rounded-xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handlePlayDemo}
                className="group px-8 py-4 border border-slate-600 rounded-xl font-semibold text-white hover:border-purple-400 hover:bg-purple-500/10 transition-all duration-300"
              >
                <span className="flex items-center justify-center">
                  <PlayIcon className="w-5 h-5 mr-2 group-hover:text-purple-400 transition-colors" />
                  Watch Demo
                </span>
              </motion.button>
            </motion.div>

            {/* Animated Stats */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9, duration: 0.8 }}
              className="grid grid-cols-2 lg:grid-cols-4 gap-6 pt-8"
            >
              {animatedStats.map((stat, index) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 1 + index * 0.1, duration: 0.6 }}
                  className="text-center"
                >
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.2 + index * 0.1, duration: 1 }}
                    className={`text-3xl lg:text-4xl font-bold ${stat.color}`}
                  >
                    <CountUpAnimation target={stat.value} suffix={stat.suffix} />
                  </motion.div>
                  <div className="text-sm text-slate-400 mt-1">{stat.label}</div>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>

          {/* Right Column - Interactive Demo */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="relative"
          >
            {/* Demo Container */}
            <div className="relative bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6 shadow-2xl">
              {/* Demo Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                  <div className="flex space-x-2">
                    <div className="w-3 h-3 bg-red-500 rounded-full" />
                    <div className="w-3 h-3 bg-yellow-500 rounded-full" />
                    <div className="w-3 h-3 bg-green-500 rounded-full" />
                  </div>
                  <span className="text-slate-400 text-sm font-medium">
                    Browser AI Agent Demo
                  </span>
                </div>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={handlePlayDemo}
                  className="p-2 bg-purple-600 rounded-lg hover:bg-purple-500 transition-colors"
                >
                  <PlayIcon className="w-4 h-4 text-white" />
                </motion.button>
              </div>

              {/* Demo Content */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentDemo}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.5 }}
                  className="space-y-4"
                >
                  <div className={`h-64 bg-gradient-to-br ${featureDemos[currentDemo].color} rounded-xl flex items-center justify-center relative overflow-hidden`}>
                    <div className="text-6xl">{featureDemos[currentDemo].icon}</div>
                    
                    {/* Animated Elements */}
                    <motion.div
                      animate={{
                        scale: [1, 1.2, 1],
                        rotate: [0, 180, 360],
                      }}
                      transition={{
                        duration: 3,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                      className="absolute top-4 right-4 w-8 h-8 bg-white/20 rounded-full"
                    />
                    
                    {isPlaying && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: [0, 1.5, 0] }}
                        transition={{ duration: 2, ease: "easeOut" }}
                        className="absolute inset-0 bg-white/10 rounded-xl"
                      />
                    )}
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-xl font-bold text-white">
                      {featureDemos[currentDemo].title}
                    </h3>
                    <p className="text-slate-300">
                      {featureDemos[currentDemo].description}
                    </p>
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Demo Navigation */}
              <div className="flex justify-center space-x-2 mt-6">
                {featureDemos.map((_, index) => (
                  <motion.button
                    key={index}
                    whileHover={{ scale: 1.2 }}
                    whileTap={{ scale: 0.8 }}
                    onClick={() => setCurrentDemo(index)}
                    className={`w-3 h-3 rounded-full transition-all duration-300 ${
                      index === currentDemo
                        ? 'bg-purple-400 shadow-lg shadow-purple-400/50'
                        : 'bg-slate-600 hover:bg-slate-500'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Floating Elements */}
            <motion.div
              animate={{
                y: [0, -20, 0],
                rotate: [0, 5, 0],
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="absolute -top-6 -right-6 w-24 h-24 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl shadow-lg shadow-purple-500/25 flex items-center justify-center"
            >
              <span className="text-2xl">🤖</span>
            </motion.div>

            <motion.div
              animate={{
                y: [0, 15, 0],
                rotate: [0, -3, 0],
              }}
              transition={{
                duration: 6,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 1,
              }}
              className="absolute -bottom-4 -left-4 w-20 h-20 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-xl shadow-lg shadow-cyan-500/25 flex items-center justify-center"
            >
              <span className="text-xl">⚡</span>
            </motion.div>
          </motion.div>
        </div>

        {/* Trust Indicators */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2, duration: 0.8 }}
          className="mt-20 text-center"
        >
          <p className="text-slate-400 text-sm mb-8">
            Trusted by 10,000+ professionals worldwide
          </p>
          
          <div className="flex flex-wrap justify-center items-center gap-8 opacity-60">
            {/* Company Logos */}
            {['Google', 'Microsoft', 'Amazon', 'Meta', 'Apple'].map((company, index) => (
              <motion.div
                key={company}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.4 + index * 0.1, duration: 0.6 }}
                className="text-slate-500 font-semibold text-lg hover:text-slate-300 transition-colors cursor-pointer"
              >
                {company}
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Scroll Indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2, duration: 1 }}
        className="absolute bottom-8 left-1/2 transform -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="w-6 h-10 border-2 border-slate-600 rounded-full flex justify-center"
        >
          <motion.div
            animate={{ y: [0, 12, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="w-1 h-3 bg-gradient-to-b from-purple-400 to-cyan-400 rounded-full mt-2"
          />
        </motion.div>
      </motion.div>
    </section>
  );
};

// =============================================================================
// COUNT UP ANIMATION COMPONENT
// =============================================================================

interface CountUpAnimationProps {
  target: string;
  suffix: string;
}

const CountUpAnimation: React.FC<CountUpAnimationProps> = ({ target, suffix }) => {
  const [count, setCount] = useState(0);
  const numericTarget = parseFloat(target.replace(/[^0-9.]/g, ''));

  useEffect(() => {
    const duration = 2000; // 2 seconds
    const steps = 60;
    const increment = numericTarget / steps;
    const stepDuration = duration / steps;

    let currentStep = 0;
    const timer = setInterval(() => {
      currentStep++;
      const currentValue = Math.min(increment * currentStep, numericTarget);
      setCount(currentValue);

      if (currentStep >= steps) {
        clearInterval(timer);
      }
    }, stepDuration);

    return () => clearInterval(timer);
  }, [numericTarget]);

  const formatValue = (value: number): string => {
    if (target.includes('M')) {
      return (value / 1000000).toFixed(1);
    } else if (target.includes('K')) {
      return (value / 1000).toFixed(1);
    } else if (target.includes('.')) {
      return value.toFixed(1);
    } else {
      return Math.floor(value).toString();
    }
  };

  return (
    <span>
      {formatValue(count)}
      {target.includes('M') ? 'M' : target.includes('K') ? 'K' : ''}
      {suffix}
    </span>
  );
};

export default HeroSection;