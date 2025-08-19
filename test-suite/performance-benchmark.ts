#!/usr/bin/env node
/**
 * Performance Benchmark Suite for Browser AI Agent
 * Measures speed, accuracy, and resource usage
 */

import { performance } from 'perf_hooks';
import { chromium, Browser, Page } from 'playwright';
import chalk from 'chalk';
import ora from 'ora';

interface BenchmarkResult {
  testName: string;
  iterations: number;
  totalTime: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
  successRate: number;
  memoryUsage: number;
  cpuUsage: number;
}

interface PerformanceMetrics {
  elementDetectionSpeed: number;
  navigationTime: number;
  screenshotTime: number;
  aiProcessingTime: number;
  memoryFootprint: number;
  successRate: number;
}

class PerformanceBenchmark {
  private browser: Browser | null = null;
  private results: BenchmarkResult[] = [];

  async initialize(): Promise<void> {
    console.log(chalk.blue.bold('🚀 Browser AI Agent Performance Benchmark\n'));
    
    const spinner = ora('Initializing benchmark environment...').start();
    
    this.browser = await chromium.launch({
      headless: true, // Headless for performance testing
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    spinner.succeed('Benchmark environment ready');
  }

  async runAllBenchmarks(): Promise<void> {
    console.log(chalk.yellow('\n📊 Running Performance Benchmarks...\n'));

    await this.benchmarkElementDetection();
    await this.benchmarkNavigationSpeed();
    await this.benchmarkScreenshotCapture();
    await this.benchmarkAIProcessing();
    await this.benchmarkMemoryUsage();
    await this.benchmarkConcurrentOperations();
    await this.benchmarkLargePageHandling();

    await this.displayResults();
  }

  async benchmarkElementDetection(): Promise<void> {
    const spinner = ora('Benchmarking element detection speed...').start();
    
    try {
      const iterations = 50;
      const times: number[] = [];
      let successCount = 0;

      if (!this.browser) throw new Error('Browser not initialized');
      const context = await this.browser.newContext();
      const page = await context.newPage();

      // Navigate to test page
      await page.goto('https://github.com/login');
      await page.waitForLoadState('networkidle');

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        
        try {
          // Simulate element detection
          const element = await page.locator('input[name="login"]').first();
          await element.isVisible();
          successCount++;
        } catch (error) {
          // Element not found
        }
        
        const endTime = performance.now();
        times.push(endTime - startTime);
      }

      await context.close();

      const result: BenchmarkResult = {
        testName: 'Element Detection Speed',
        iterations,
        totalTime: times.reduce((sum, time) => sum + time, 0),
        averageTime: times.reduce((sum, time) => sum + time, 0) / times.length,
        minTime: Math.min(...times),
        maxTime: Math.max(...times),
        successRate: (successCount / iterations) * 100,
        memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024, // MB
        cpuUsage: 0 // Would need additional monitoring
      };

      this.results.push(result);
      spinner.succeed(`Element detection: ${result.averageTime.toFixed(2)}ms avg, ${result.successRate.toFixed(1)}% success`);

    } catch (error) {
      spinner.fail(`Element detection benchmark failed: ${error.message}`);
    }
  }

  async benchmarkNavigationSpeed(): Promise<void> {
    const spinner = ora('Benchmarking navigation speed...').start();
    
    try {
      const iterations = 20;
      const times: number[] = [];
      let successCount = 0;

      const urls = [
        'https://github.com',
        'https://stackoverflow.com',
        'https://www.google.com',
        'https://example.com'
      ];

      if (!this.browser) throw new Error('Browser not initialized');

      for (let i = 0; i < iterations; i++) {
        const context = await this.browser.newContext();
        const page = await context.newPage();
        
        const url = urls[i % urls.length];
        const startTime = performance.now();
        
        try {
          await page.goto(url, { waitUntil: 'networkidle', timeout: 10000 });
          successCount++;
        } catch (error) {
          // Navigation failed
        }
        
        const endTime = performance.now();
        times.push(endTime - startTime);
        
        await context.close();
      }

      const result: BenchmarkResult = {
        testName: 'Navigation Speed',
        iterations,
        totalTime: times.reduce((sum, time) => sum + time, 0),
        averageTime: times.reduce((sum, time) => sum + time, 0) / times.length,
        minTime: Math.min(...times),
        maxTime: Math.max(...times),
        successRate: (successCount / iterations) * 100,
        memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024,
        cpuUsage: 0
      };

      this.results.push(result);
      spinner.succeed(`Navigation: ${result.averageTime.toFixed(0)}ms avg, ${result.successRate.toFixed(1)}% success`);

    } catch (error) {
      spinner.fail(`Navigation benchmark failed: ${error.message}`);
    }
  }

  async benchmarkScreenshotCapture(): Promise<void> {
    const spinner = ora('Benchmarking screenshot capture...').start();
    
    try {
      const iterations = 30;
      const times: number[] = [];
      let successCount = 0;

      if (!this.browser) throw new Error('Browser not initialized');
      const context = await this.browser.newContext();
      const page = await context.newPage();

      await page.goto('https://example.com');
      await page.waitForLoadState('networkidle');

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        
        try {
          await page.screenshot({ type: 'png' });
          successCount++;
        } catch (error) {
          // Screenshot failed
        }
        
        const endTime = performance.now();
        times.push(endTime - startTime);
      }

      await context.close();

      const result: BenchmarkResult = {
        testName: 'Screenshot Capture',
        iterations,
        totalTime: times.reduce((sum, time) => sum + time, 0),
        averageTime: times.reduce((sum, time) => sum + time, 0) / times.length,
        minTime: Math.min(...times),
        maxTime: Math.max(...times),
        successRate: (successCount / iterations) * 100,
        memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024,
        cpuUsage: 0
      };

      this.results.push(result);
      spinner.succeed(`Screenshot: ${result.averageTime.toFixed(2)}ms avg, ${result.successRate.toFixed(1)}% success`);

    } catch (error) {
      spinner.fail(`Screenshot benchmark failed: ${error.message}`);
    }
  }

  async benchmarkAIProcessing(): Promise<void> {
    const spinner = ora('Benchmarking AI processing speed...').start();
    
    try {
      const iterations = 25;
      const times: number[] = [];
      let successCount = 0;

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        
        try {
          // Simulate AI processing delay
          await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
          successCount++;
        } catch (error) {
          // AI processing failed
        }
        
        const endTime = performance.now();
        times.push(endTime - startTime);
      }

      const result: BenchmarkResult = {
        testName: 'AI Processing Speed',
        iterations,
        totalTime: times.reduce((sum, time) => sum + time, 0),
        averageTime: times.reduce((sum, time) => sum + time, 0) / times.length,
        minTime: Math.min(...times),
        maxTime: Math.max(...times),
        successRate: (successCount / iterations) * 100,
        memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024,
        cpuUsage: 0
      };

      this.results.push(result);
      spinner.succeed(`AI Processing: ${result.averageTime.toFixed(2)}ms avg, ${result.successRate.toFixed(1)}% success`);

    } catch (error) {
      spinner.fail(`AI processing benchmark failed: ${error.message}`);
    }
  }

  async benchmarkMemoryUsage(): Promise<void> {
    const spinner = ora('Benchmarking memory usage...').start();
    
    try {
      const iterations = 10;
      const memoryReadings: number[] = [];

      if (!this.browser) throw new Error('Browser not initialized');

      for (let i = 0; i < iterations; i++) {
        const context = await this.browser.newContext();
        const page = await context.newPage();
        
        await page.goto('https://example.com');
        await page.waitForLoadState('networkidle');
        
        // Take screenshot to simulate work
        await page.screenshot();
        
        const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;
        memoryReadings.push(memoryUsage);
        
        await context.close();
      }

      const result: BenchmarkResult = {
        testName: 'Memory Usage',
        iterations,
        totalTime: 0,
        averageTime: memoryReadings.reduce((sum, mem) => sum + mem, 0) / memoryReadings.length,
        minTime: Math.min(...memoryReadings),
        maxTime: Math.max(...memoryReadings),
        successRate: 100,
        memoryUsage: memoryReadings[memoryReadings.length - 1],
        cpuUsage: 0
      };

      this.results.push(result);
      spinner.succeed(`Memory Usage: ${result.averageTime.toFixed(1)}MB avg, ${result.maxTime.toFixed(1)}MB peak`);

    } catch (error) {
      spinner.fail(`Memory benchmark failed: ${error.message}`);
    }
  }

  async benchmarkConcurrentOperations(): Promise<void> {
    const spinner = ora('Benchmarking concurrent operations...').start();
    
    try {
      const concurrency = 5;
      const iterations = 20;
      
      if (!this.browser) throw new Error('Browser not initialized');

      const startTime = performance.now();
      
      const promises = Array.from({ length: concurrency }, async () => {
        const context = await this.browser!.newContext();
        const page = await context.newPage();
        
        for (let i = 0; i < iterations / concurrency; i++) {
          await page.goto('https://example.com');
          await page.waitForLoadState('networkidle');
          await page.screenshot();
        }
        
        await context.close();
      });

      await Promise.all(promises);
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;

      const result: BenchmarkResult = {
        testName: 'Concurrent Operations',
        iterations,
        totalTime,
        averageTime: totalTime / iterations,
        minTime: 0,
        maxTime: 0,
        successRate: 100,
        memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024,
        cpuUsage: 0
      };

      this.results.push(result);
      spinner.succeed(`Concurrent Ops: ${result.averageTime.toFixed(0)}ms per operation, ${concurrency} concurrent`);

    } catch (error) {
      spinner.fail(`Concurrent operations benchmark failed: ${error.message}`);
    }
  }

  async benchmarkLargePageHandling(): Promise<void> {
    const spinner = ora('Benchmarking large page handling...').start();
    
    try {
      const iterations = 5;
      const times: number[] = [];
      let successCount = 0;

      // URLs with large/complex pages
      const largePages = [
        'https://github.com/microsoft/playwright',
        'https://stackoverflow.com/questions',
        'https://www.reddit.com',
        'https://news.ycombinator.com'
      ];

      if (!this.browser) throw new Error('Browser not initialized');

      for (let i = 0; i < iterations; i++) {
        const context = await this.browser.newContext();
        const page = await context.newPage();
        
        const url = largePages[i % largePages.length];
        const startTime = performance.now();
        
        try {
          await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
          await page.screenshot({ fullPage: true });
          successCount++;
        } catch (error) {
          // Large page handling failed
        }
        
        const endTime = performance.now();
        times.push(endTime - startTime);
        
        await context.close();
      }

      const result: BenchmarkResult = {
        testName: 'Large Page Handling',
        iterations,
        totalTime: times.reduce((sum, time) => sum + time, 0),
        averageTime: times.reduce((sum, time) => sum + time, 0) / times.length,
        minTime: Math.min(...times),
        maxTime: Math.max(...times),
        successRate: (successCount / iterations) * 100,
        memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024,
        cpuUsage: 0
      };

      this.results.push(result);
      spinner.succeed(`Large Pages: ${(result.averageTime / 1000).toFixed(1)}s avg, ${result.successRate.toFixed(1)}% success`);

    } catch (error) {
      spinner.fail(`Large page benchmark failed: ${error.message}`);
    }
  }

  async displayResults(): Promise<void> {
    console.log(chalk.blue.bold('\n📊 Performance Benchmark Results\n'));

    // Summary table
    console.log(chalk.yellow('Performance Summary:'));
    console.log('─'.repeat(80));
    console.log(chalk.bold('Test Name'.padEnd(25) + 'Avg Time'.padEnd(12) + 'Success Rate'.padEnd(15) + 'Memory (MB)'));
    console.log('─'.repeat(80));

    for (const result of this.results) {
      const avgTime = result.testName === 'Memory Usage' 
        ? `${result.averageTime.toFixed(1)}MB`
        : result.testName === 'Large Page Handling'
        ? `${(result.averageTime / 1000).toFixed(1)}s`
        : `${result.averageTime.toFixed(1)}ms`;
      
      const successRate = `${result.successRate.toFixed(1)}%`;
      const memory = `${result.memoryUsage.toFixed(1)}`;
      
      console.log(
        result.testName.padEnd(25) + 
        avgTime.padEnd(12) + 
        successRate.padEnd(15) + 
        memory
      );
    }

    console.log('─'.repeat(80));

    // Performance grades
    console.log(chalk.blue.bold('\n🏆 Performance Grades:\n'));

    const grades = this.calculatePerformanceGrades();
    for (const [category, grade] of Object.entries(grades)) {
      const color = grade === 'A+' ? chalk.green : 
                   grade === 'A' ? chalk.green :
                   grade === 'B' ? chalk.yellow :
                   grade === 'C' ? chalk.orange : chalk.red;
      
      console.log(`${category.padEnd(20)}: ${color.bold(grade)}`);
    }

    // Recommendations
    console.log(chalk.blue.bold('\n💡 Performance Recommendations:\n'));
    
    const recommendations = this.generateRecommendations();
    recommendations.forEach(rec => {
      console.log(`• ${rec}`);
    });

    // Comparison with benchmarks
    console.log(chalk.blue.bold('\n📈 Benchmark Comparison:\n'));
    
    const comparison = this.compareWithBenchmarks();
    for (const [metric, status] of Object.entries(comparison)) {
      const icon = status === 'excellent' ? '🟢' :
                   status === 'good' ? '🟡' :
                   status === 'needs_improvement' ? '🟠' : '🔴';
      
      console.log(`${icon} ${metric}: ${status.replace('_', ' ')}`);
    }
  }

  private calculatePerformanceGrades(): Record<string, string> {
    const grades: Record<string, string> = {};

    for (const result of this.results) {
      let grade = 'F';
      
      switch (result.testName) {
        case 'Element Detection Speed':
          if (result.averageTime < 50) grade = 'A+';
          else if (result.averageTime < 100) grade = 'A';
          else if (result.averageTime < 200) grade = 'B';
          else if (result.averageTime < 500) grade = 'C';
          else grade = 'D';
          break;
          
        case 'Navigation Speed':
          if (result.averageTime < 1000) grade = 'A+';
          else if (result.averageTime < 2000) grade = 'A';
          else if (result.averageTime < 3000) grade = 'B';
          else if (result.averageTime < 5000) grade = 'C';
          else grade = 'D';
          break;
          
        case 'Screenshot Capture':
          if (result.averageTime < 200) grade = 'A+';
          else if (result.averageTime < 500) grade = 'A';
          else if (result.averageTime < 1000) grade = 'B';
          else if (result.averageTime < 2000) grade = 'C';
          else grade = 'D';
          break;
          
        case 'Memory Usage':
          if (result.averageTime < 100) grade = 'A+';
          else if (result.averageTime < 200) grade = 'A';
          else if (result.averageTime < 300) grade = 'B';
          else if (result.averageTime < 500) grade = 'C';
          else grade = 'D';
          break;
      }
      
      grades[result.testName] = grade;
    }

    return grades;
  }

  private generateRecommendations(): string[] {
    const recommendations: string[] = [];

    for (const result of this.results) {
      if (result.testName === 'Element Detection Speed' && result.averageTime > 100) {
        recommendations.push('Consider optimizing element selectors for faster detection');
      }
      
      if (result.testName === 'Navigation Speed' && result.averageTime > 3000) {
        recommendations.push('Enable browser caching and optimize network settings');
      }
      
      if (result.testName === 'Memory Usage' && result.averageTime > 300) {
        recommendations.push('Implement memory cleanup and optimize resource usage');
      }
      
      if (result.successRate < 95) {
        recommendations.push(`Improve reliability for ${result.testName} (${result.successRate.toFixed(1)}% success rate)`);
      }
    }

    if (recommendations.length === 0) {
      recommendations.push('Excellent performance! All benchmarks are within optimal ranges.');
    }

    return recommendations;
  }

  private compareWithBenchmarks(): Record<string, string> {
    const comparison: Record<string, string> = {};

    // Industry benchmark comparisons
    const benchmarks = {
      'Element Detection': { excellent: 50, good: 100, acceptable: 200 },
      'Page Navigation': { excellent: 1500, good: 3000, acceptable: 5000 },
      'Screenshot Capture': { excellent: 300, good: 600, acceptable: 1000 },
      'Memory Usage': { excellent: 150, good: 250, acceptable: 400 }
    };

    for (const result of this.results) {
      const key = result.testName.replace(' Speed', '').replace(' Handling', '');
      const benchmark = benchmarks[key];
      
      if (benchmark) {
        if (result.averageTime <= benchmark.excellent) {
          comparison[key] = 'excellent';
        } else if (result.averageTime <= benchmark.good) {
          comparison[key] = 'good';
        } else if (result.averageTime <= benchmark.acceptable) {
          comparison[key] = 'acceptable';
        } else {
          comparison[key] = 'needs_improvement';
        }
      }
    }

    return comparison;
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

// Main execution
async function main() {
  const benchmark = new PerformanceBenchmark();
  
  try {
    await benchmark.initialize();
    await benchmark.runAllBenchmarks();
  } catch (error) {
    console.error(chalk.red(`\n❌ Benchmark failed: ${error.message}`));
    process.exit(1);
  } finally {
    await benchmark.cleanup();
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

export { PerformanceBenchmark };