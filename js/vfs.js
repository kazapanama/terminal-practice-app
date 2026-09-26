// A tiny in-memory file system for the trainer's tasks. Paths are relative to
// the working directory; directories exist implicitly ("logs/app.log" makes
// "logs" a directory).

export class FsError extends Error {
    constructor(code, path) {
        super(code === 'EISDIR' ? `${path}: Is a directory` : `${path}: No such file or directory`);
        this.code = code;
        this.path = path;
    }
}

export function normalizePath(path) {
    const parts = [];
    for (const part of path.split('/')) {
        if (part === '' || part === '.') continue;
        if (part === '..') { parts.pop(); continue; }
        parts.push(part);
    }
    return parts.join('/');
}

export class VirtualFS {
    constructor(files = {}) {
        this.files = new Map();
        for (const [path, text] of Object.entries(files)) this.files.set(normalizePath(path), text);
    }

    clone() {
        const copy = new VirtualFS();
        copy.files = new Map(this.files);
        return copy;
    }

    toObject() {
        return Object.fromEntries(this.files);
    }

    isFile(path) {
        return this.files.has(normalizePath(path));
    }

    isDir(path) {
        const p = normalizePath(path);
        if (p === '') return true;
        for (const name of this.files.keys()) if (name.startsWith(p + '/')) return true;
        return false;
    }

    exists(path) {
        return this.isFile(path) || this.isDir(path);
    }

    read(path) {
        if (path === '/dev/null') return '';
        const p = normalizePath(path);
        if (this.files.has(p)) return this.files.get(p);
        if (this.isDir(p)) throw new FsError('EISDIR', path);
        throw new FsError('ENOENT', path);
    }

    write(path, text, append = false) {
        if (path === '/dev/null') return;
        const p = normalizePath(path);
        if (p === '' || this.isDir(p)) throw new FsError('EISDIR', path);
        const dir = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
        if (dir && !this.isDir(dir)) throw new FsError('ENOENT', path);
        this.files.set(p, append && this.files.has(p) ? this.files.get(p) + text : text);
    }

    // Entries directly inside a directory: [{ name, dir }]
    list(path = '') {
        const p = normalizePath(path);
        const prefix = p === '' ? '' : p + '/';
        const entries = new Map();
        for (const name of this.files.keys()) {
            if (!name.startsWith(prefix)) continue;
            const rest = name.slice(prefix.length);
            const slash = rest.indexOf('/');
            if (slash === -1) entries.set(rest, false);
            else entries.set(rest.slice(0, slash), true);
        }
        return [...entries].map(([name, dir]) => ({ name, dir })).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    }

    // All files under a directory (recursively), sorted
    walk(path = '') {
        const p = normalizePath(path);
        const prefix = p === '' ? '' : p + '/';
        return [...this.files.keys()].filter(n => n.startsWith(prefix)).sort();
    }

    // Every path a glob can match: files and the implicit directories
    allPaths() {
        const paths = new Set();
        for (const name of this.files.keys()) {
            paths.add(name);
            const parts = name.split('/');
            for (let i = 1; i < parts.length; i++) paths.add(parts.slice(0, i).join('/'));
        }
        return [...paths].sort();
    }
}
