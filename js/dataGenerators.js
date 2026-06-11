// Sample data generators for practice mode.
// Every generator returns an array of lines with randomized content so the
// same problem template still produces a fresh task each time.

import { randInt, shuffle, pick } from './utils.js';

const NAMES = ['alice', 'bob', 'charlie', 'diana', 'eve', 'frank', 'grace', 'henry', 'ivan', 'julia', 'kevin', 'laura', 'mike', 'nina', 'oscar', 'petra'];
const DEPTS = ['engineering', 'marketing', 'sales', 'hr', 'finance', 'support'];
const FRUITS = ['apple', 'banana', 'cherry', 'date', 'elderberry', 'fig', 'grape', 'honeydew', 'kiwi', 'lemon', 'mango', 'orange', 'papaya', 'quince', 'raspberry', 'tangerine'];
const WORDS = ['hello', 'world', 'linux', 'command', 'terminal', 'practice', 'learn', 'code', 'shell', 'script', 'text', 'file', 'data', 'process', 'kernel', 'buffer'];
const CITIES = ['kyiv', 'lviv', 'odesa', 'kharkiv', 'dnipro', 'vinnytsia', 'poltava', 'lutsk'];
const PRODUCTS = ['laptop', 'phone', 'tablet', 'monitor', 'keyboard', 'mouse', 'headset', 'webcam', 'printer', 'router'];
const CATEGORIES = ['electronics', 'accessories', 'office', 'audio', 'network'];
const ENDPOINTS = ['/api/users', '/api/login', '/api/orders', '/api/products', '/api/health', '/index.html', '/static/app.js'];
const METHODS = ['GET', 'GET', 'GET', 'POST', 'PUT', 'DELETE'];
const STATUSES = [200, 200, 200, 201, 301, 401, 404, 500, 503];
const SHELLS = ['/bin/bash', '/bin/bash', '/bin/zsh', '/bin/sh', '/usr/sbin/nologin', '/bin/false'];
const DOMAINS = ['gmail.com', 'ukr.net', 'proton.me', 'example.com', 'corp.io'];
const LOG_LEVELS = ['INFO', 'ERROR', 'WARNING', 'DEBUG'];
const LOG_MESSAGES = ['User logged in', 'Connection failed', 'File not found', 'Process started', 'Memory low', 'Backup complete', 'Request timeout', 'Database error', 'Cache cleared', 'Disk almost full', 'Session expired', 'Config reloaded'];
const PROCESSES = ['systemd', 'nginx', 'postgres', 'sshd', 'node', 'redis', 'cron', 'dockerd'];
const FILE_NAMES = ['notes.txt', 'report.pdf', 'backup.tar.gz', 'app.log', 'config.yml', 'data.csv', 'script.sh', 'index.html', 'photo.jpg', 'readme.md'];
const DIRS = ['/home/user', '/var/log', '/etc', '/usr/bin', '/tmp', '/opt/app'];

function randomDate() {
    return `2024-${String(randInt(1, 12)).padStart(2, '0')}-${String(randInt(1, 28)).padStart(2, '0')}`;
}

function randomIp() {
    return `${pick(['10.0.0', '192.168.1', '172.16.0'])}.${randInt(1, 9)}`;
}

export const dataGenerators = {
    fruits: () => shuffle(FRUITS).slice(0, randInt(5, 10)),

    numbers: () => Array.from({ length: randInt(6, 12) }, () => randInt(1, 100)),

    bigNumbers: () => Array.from({ length: randInt(6, 10) }, () => randInt(1, 5000)),

    words: () => shuffle(WORDS).slice(0, randInt(5, 10)),

    logs: () => Array.from({ length: randInt(6, 10) }, () =>
        `${pick(LOG_LEVELS)}: ${pick(LOG_MESSAGES)}`
    ),

    timestampedLogs: () => Array.from({ length: randInt(6, 10) }, () =>
        `${randomDate()} ${String(randInt(0, 23)).padStart(2, '0')}:${String(randInt(0, 59)).padStart(2, '0')} ${pick(LOG_LEVELS)} ${pick(LOG_MESSAGES)}`
    ),

    csv: () => shuffle(NAMES).slice(0, randInt(4, 7)).map(name =>
        `${name},${pick(DEPTS)},${randInt(40, 120) * 1000}`
    ),

    csvWithHeader: () => {
        const rows = shuffle(NAMES).slice(0, randInt(4, 6)).map(name =>
            `${name},${pick(DEPTS)},${randInt(40, 120) * 1000}`
        );
        return ['name,department,salary', ...rows];
    },

    inventory: () => shuffle(PRODUCTS).slice(0, randInt(5, 8)).map(p =>
        `${p},${pick(CATEGORIES)},${randInt(5, 200) * 10},${randInt(0, 50)}`
    ),

    accessLog: () => Array.from({ length: randInt(6, 10) }, () =>
        `${pick(METHODS)} ${pick(ENDPOINTS)} ${pick(STATUSES)} ${randInt(5, 900)}ms`
    ),

    passwd: () => {
        const users = shuffle(NAMES).slice(0, randInt(4, 7));
        return users.map((u, i) =>
            `${u}:x:${1000 + i}:${1000 + i}:${u[0].toUpperCase()}${u.slice(1)}:/home/${u}:${pick(SHELLS)}`
        );
    },

    ips: () => {
        const pool = Array.from({ length: 4 }, randomIp);
        return Array.from({ length: randInt(8, 12) }, () => pick(pool));
    },

    emails: () => shuffle(NAMES).slice(0, randInt(5, 8)).map(n =>
        `${n}${randInt(1, 99)}@${pick(DOMAINS)}`
    ),

    processes: () => shuffle(PROCESSES).slice(0, randInt(5, 8)).map(p =>
        `${pick(['root', 'www-data', 'postgres', 'user'])} ${randInt(100, 9999)} ${randInt(0, 90)}.${randInt(0, 9)} ${p}`
    ),

    scores: () => shuffle(NAMES).slice(0, randInt(5, 8)).map(n =>
        `${n} ${randInt(40, 100)}`
    ),

    temperatures: () => shuffle(CITIES).slice(0, randInt(5, 8)).map(c =>
        `${c},${randInt(-15, 35)}`
    ),

    fileSizes: () => shuffle(FILE_NAMES).slice(0, randInt(5, 8)).map(f =>
        `${randInt(1, 9999)} ${pick(DIRS)}/${f}`
    ),

    sales: () => Array.from({ length: randInt(6, 9) }, () =>
        `${randomDate()},${pick(NAMES.slice(0, 5))},${pick(PRODUCTS)},${randInt(1, 50) * 10}`
    ),

    duplicates: () => {
        const items = shuffle(FRUITS).slice(0, randInt(3, 5));
        const result = [];
        items.forEach(item => {
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
            'mixed CASE text HERE',
            'Sphinx of black quartz'
        ];
        return shuffle(lines).slice(0, randInt(4, 7));
    },

    paths: () => Array.from({ length: randInt(5, 8) }, () =>
        `${pick(DIRS)}/${pick(FILE_NAMES)}`
    ),

    sentences: () => {
        const sentences = [
            'Linux is an open source operating system',
            'The command line is powerful and efficient',
            'Practice makes perfect when learning',
            'Text processing is a key skill',
            'Pipes connect commands together',
            'Regular expressions match patterns',
            'Shell scripts automate tasks',
            'Streams flow from one command to the next'
        ];
        return shuffle(sentences).slice(0, randInt(4, 6));
    }
};

// Metadata used by the pipeline composer in problemGenerators.js
export const datasetInfo = {
    csv: { delim: ',', fields: ['name', 'department', 'salary'], numericField: 3, categoryField: 2 },
    csvWithHeader: { delim: ',', fields: ['name', 'department', 'salary'], numericField: 3, categoryField: 2, hasHeader: true },
    inventory: { delim: ',', fields: ['product', 'category', 'price', 'quantity'], numericField: 3, categoryField: 2 },
    accessLog: { delim: ' ', fields: ['method', 'endpoint', 'status code', 'response time'], categoryField: 1 },
    passwd: { delim: ':', fields: ['username', 'password', 'UID', 'GID', 'full name', 'home directory', 'shell'], categoryField: 7 },
    temperatures: { delim: ',', fields: ['city', 'temperature'], numericField: 2 },
    sales: { delim: ',', fields: ['date', 'seller', 'product', 'amount'], numericField: 4, categoryField: 2 },
    scores: { delim: ' ', fields: ['name', 'score'], numericField: 2 },
    processes: { delim: ' ', fields: ['user', 'PID', 'CPU usage', 'process name'], categoryField: 1 }
};
