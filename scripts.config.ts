import { DenonConfig } from 'https://deno.land/x/denon@2.5.0/mod.ts';

const config: DenonConfig = {
    scripts: {
        build: {
            cmd: 'deno task build',
            desc: 'Build once',
            watch: false,
        },

        watch: {
            cmd: 'deno task build',
            desc: 'Build and watch for updates',
        },
    },

    watcher: {
        'exts': ['js', 'jsx', 'ts', 'tsx', 'json', 'jsonc', 'toml', 'md'],
        'match': [
            './src/**/*.*',
            './deno.json',
            './build.ts',
            './scripts.config.ts',
            'CHANGELOG.md',
        ],
        'skip': ['./.git/**', './dist/**'],
    },
};

export default config;
