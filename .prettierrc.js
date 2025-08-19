// =============================================================================
// ENTERPRISE PRETTIER CONFIGURATION
// Code formatting for Browser AI Agent - Superior to Manus AI
// =============================================================================

module.exports = {
  // Basic formatting
  semi: true,
  trailingComma: 'es5',
  singleQuote: true,
  doubleQuote: false,
  quoteProps: 'as-needed',
  
  // Indentation
  tabWidth: 2,
  useTabs: false,
  
  // Line length
  printWidth: 100,
  
  // Bracket spacing
  bracketSpacing: true,
  bracketSameLine: false,
  
  // Arrow functions
  arrowParens: 'avoid',
  
  // JSX formatting
  jsxSingleQuote: true,
  jsxBracketSameLine: false,
  
  // HTML formatting
  htmlWhitespaceSensitivity: 'css',
  
  // End of line
  endOfLine: 'lf',
  
  // Embedded language formatting
  embeddedLanguageFormatting: 'auto',
  
  // Plugin-specific overrides
  overrides: [
    {
      files: '*.json',
      options: {
        printWidth: 120,
        tabWidth: 2,
      },
    },
    {
      files: '*.md',
      options: {
        printWidth: 80,
        proseWrap: 'always',
        tabWidth: 2,
      },
    },
    {
      files: '*.yml',
      options: {
        tabWidth: 2,
        singleQuote: false,
      },
    },
    {
      files: '*.yaml',
      options: {
        tabWidth: 2,
        singleQuote: false,
      },
    },
    {
      files: ['*.ts', '*.tsx'],
      options: {
        parser: 'typescript',
        printWidth: 100,
        tabWidth: 2,
        semi: true,
        singleQuote: true,
        trailingComma: 'es5',
      },
    },
    {
      files: ['*.js', '*.jsx'],
      options: {
        parser: 'babel',
        printWidth: 100,
        tabWidth: 2,
        semi: true,
        singleQuote: true,
        trailingComma: 'es5',
      },
    },
    {
      files: '*.css',
      options: {
        parser: 'css',
        printWidth: 120,
        tabWidth: 2,
        singleQuote: false,
      },
    },
    {
      files: '*.scss',
      options: {
        parser: 'scss',
        printWidth: 120,
        tabWidth: 2,
        singleQuote: false,
      },
    },
    {
      files: '*.html',
      options: {
        parser: 'html',
        printWidth: 120,
        tabWidth: 2,
        htmlWhitespaceSensitivity: 'ignore',
      },
    },
  ],
  
  // Plugins
  plugins: [
    'prettier-plugin-tailwindcss', // For Tailwind CSS class sorting
    '@trivago/prettier-plugin-sort-imports', // For import sorting
  ],
  
  // Import sorting configuration
  importOrder: [
    '^react$',
    '^next',
    '<THIRD_PARTY_MODULES>',
    '^@/(.*)$',
    '^@api/(.*)$',
    '^@agents/(.*)$',
    '^@website/(.*)$',
    '^@shared/(.*)$',
    '^[./]',
  ],
  importOrderSeparation: true,
  importOrderSortSpecifiers: true,
  
  // Tailwind CSS configuration
  tailwindConfig: './tailwind.config.js',
  tailwindFunctions: ['clsx', 'cn', 'cva'],
};