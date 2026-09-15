import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  { ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'next-env.d.ts'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    // The domain layer must stay pure: no framework, no I/O, no ambient clock.
    files: ['src/domain/**/*.ts'],
    ignores: ['src/domain/**/*.test.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: 'Injecter le port Clock — voir domain/scheduling.' },
        { name: 'fetch', message: 'Le domaine ne fait pas d I/O.' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react', 'react-dom', 'next/*', '@supabase/*', '@/infrastructure/*', '@/app/*'], message: 'src/domain ne depend d aucune couche exterieure.' },
          ],
        },
      ],
    },
  },
  {
    files: ['src/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@/infrastructure/*', '@/app/*', 'next/*'], message: 'src/application passe par les ports, jamais par une implementation.' },
          ],
        },
      ],
    },
  },
];

export default config;
