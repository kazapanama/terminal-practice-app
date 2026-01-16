// Sample data generators for practice mode

import { randInt, shuffle } from './utils.js';

export const dataGenerators = {
    fruits: () => {
        const fruits = ['apple', 'banana', 'cherry', 'date', 'elderberry', 'fig', 'grape', 'honeydew', 'kiwi', 'lemon', 'mango', 'orange', 'papaya', 'quince'];
        return shuffle(fruits).slice(0, randInt(5, 10));
    },

    numbers: () => {
        return Array.from({ length: randInt(6, 12) }, () => randInt(1, 100));
    },

    words: () => {
        const words = ['hello', 'world', 'linux', 'command', 'terminal', 'practice', 'learn', 'code', 'shell', 'script', 'text', 'file', 'data', 'process'];
        return shuffle(words).slice(0, randInt(5, 10));
    },

    logs: () => {
        const levels = ['INFO', 'ERROR', 'WARNING', 'DEBUG'];
        const messages = ['User logged in', 'Connection failed', 'File not found', 'Process started', 'Memory low', 'Backup complete', 'Request timeout', 'Database error'];
        return Array.from({ length: randInt(6, 10) }, () =>
            `${levels[randInt(0, levels.length - 1)]}: ${messages[randInt(0, messages.length - 1)]}`
        );
    },

    csv: () => {
        const names = ['alice', 'bob', 'charlie', 'diana', 'eve', 'frank', 'grace', 'henry'];
        const depts = ['engineering', 'marketing', 'sales', 'hr', 'finance'];
        return shuffle(names).slice(0, randInt(4, 7)).map(name =>
            `${name},${depts[randInt(0, depts.length - 1)]},${randInt(40, 120) * 1000}`
        );
    },

    duplicates: () => {
        const items = ['apple', 'banana', 'cherry', 'date', 'elderberry'];
        const result = [];
        items.slice(0, randInt(3, 5)).forEach(item => {
            const count = randInt(1, 4);
            for (let i = 0; i < count; i++) result.push(item);
        });
        return result;
    },

    mixed: () => {
        const lines = [
            'The quick brown fox',
            'JUMPS OVER THE LAZY DOG',
            'Pack my box with five',
            'DOZEN LIQUOR JUGS',
            'hello world 123',
            'TESTING 456 ABC',
            'mixed CASE text HERE'
        ];
        return shuffle(lines).slice(0, randInt(4, 7));
    },

    paths: () => {
        const dirs = ['/home/user', '/var/log', '/etc', '/usr/bin', '/tmp'];
        const files = ['config.txt', 'data.csv', 'log.txt', 'script.sh', 'readme.md'];
        return Array.from({ length: randInt(5, 8) }, () =>
            `${dirs[randInt(0, dirs.length - 1)]}/${files[randInt(0, files.length - 1)]}`
        );
    },

    sentences: () => {
        const sentences = [
            'Linux is an open source operating system',
            'The command line is powerful and efficient',
            'Practice makes perfect when learning',
            'Text processing is a key skill',
            'Pipes connect commands together',
            'Regular expressions match patterns',
            'Shell scripts automate tasks'
        ];
        return shuffle(sentences).slice(0, randInt(4, 6));
    }
};
