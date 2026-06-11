// Generates data/master.json and data/realworld.json.
// Each task defines text + solution; `expected` is computed by actually
// running the solution through the app's command implementations, so the
// data can never drift from the engine.
// Run: node scripts/generateLevels.mjs

import { writeFileSync } from 'fs';
import { executePipeline } from '../js/commands.js';

// --- Master level: awk, advanced sed, nl, paste, and power flags -----------

const master = [
    {
        text: 'laptop,1200,5\nphone,800,12\ntablet,450,8\nmonitor,300,15\nkeyboard,75,30',
        description: 'Using awk, print only the product names (1st comma-separated field).',
        solution: `awk -F',' '{print $1}'`,
        hint: `Use: awk -F',' '{print $1}' - the -F flag sets the field separator`
    },
    {
        text: 'root 1 0.0 systemd\nwww-data 1337 2.5 nginx\npostgres 2001 5.1 postgres\nuser 3742 1.2 firefox',
        description: 'Using awk, print the LAST field of every line ($NF).',
        solution: `awk '{print $NF}'`,
        hint: `Use: awk '{print $NF}' - NF holds the number of fields, $NF is the last one`
    },
    {
        text: 'one two three\nalpha beta\nred green blue yellow\nsingle',
        description: 'Using awk, print the number of fields (words) in each line.',
        solution: `awk '{print NF}'`,
        hint: `Use: awk '{print NF}'`
    },
    {
        text: 'deploy started\nbuild passed\ntests passed\ndeploy finished',
        description: 'Using awk, print each line prefixed with its line number and ": " (e.g. "1: deploy started").',
        solution: `awk '{print NR": "$0}'`,
        hint: `Use: awk '{print NR": "$0}' - NR is the line number, $0 the whole line`
    },
    {
        text: 'alice,82\nbob,47\ncarol,95\ndave,61\neve,78',
        description: 'Using awk, print the names of students who scored more than 60 (2nd field).',
        solution: `awk -F',' '$2 > 60 {print $1}'`,
        hint: `Use: awk -F',' '$2 > 60 {print $1}' - the condition before {} filters lines`
    },
    {
        text: 'alice,engineering\nbob,sales\ncarol,engineering\ndave,marketing\neve,engineering',
        description: 'Using awk, print the names of everyone whose department (2nd field) is exactly "engineering".',
        solution: `awk -F',' '$2 == "engineering" {print $1}'`,
        hint: `Use: awk -F',' '$2 == "engineering" {print $1}'`
    },
    {
        text: '120\n340\n95\n210\n55',
        description: 'Using awk, compute the sum of all the numbers.',
        solution: `awk '{sum += $1} END {print sum}'`,
        hint: `Use: awk '{sum += $1} END {print sum}' - accumulate, then print once at the END`
    },
    {
        text: 'INFO service started\nERROR disk full\nINFO heartbeat ok\nERROR connection lost\nERROR timeout\nWARN retrying',
        description: 'Using a single awk command, count how many lines contain "ERROR".',
        solution: `awk '/ERROR/ {n++} END {print n}'`,
        hint: `Use: awk '/ERROR/ {n++} END {print n}' - a /pattern/ rule runs only on matching lines`
    },
    {
        text: 'alice 93\nbob 78\ncarol 85',
        description: 'Using awk, swap the columns: print the score first, then the name.',
        solution: `awk '{print $2, $1}'`,
        hint: `Use: awk '{print $2, $1}' - a comma inserts a space between fields`
    },
    {
        text: 'HOME,/home/user\nSHELL,/bin/bash\nEDITOR,vim\nLANG,en_US.UTF-8',
        description: 'Using awk, print each pair in the format KEY=VALUE (fields joined by "=").',
        solution: `awk -F',' '{print $1"="$2}'`,
        hint: `Use: awk -F',' '{print $1"="$2}' - adjacent expressions are concatenated`
    },
    {
        text: 'root:x:0:0:root:/root:/bin/bash\ndaemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin\nalice:x:1000:1000:Alice:/home/alice:/bin/bash\nbob:x:1001:1001:Bob:/home/bob:/bin/zsh',
        description: 'From this /etc/passwd data, use awk with ":" as separator to print username and shell separated by a space.',
        solution: `awk -F':' '{print $1, $7}'`,
        hint: `Use: awk -F':' '{print $1, $7}'`
    },
    {
        text: '80\n90\n70\n100\n60',
        description: 'Using awk, compute the average of the numbers (sum divided by the number of lines).',
        solution: `awk '{s += $1} END {print s/NR}'`,
        hint: `Use: awk '{s += $1} END {print s/NR}' - in END, NR equals the total line count`
    },
    {
        text: 'INFO boot ok\nDEBUG cache warm\nERROR disk failure\nINFO sync done\nDEBUG gc pause\nERROR oom kill',
        description: 'Using sed, delete every line containing "DEBUG".',
        solution: `sed '/DEBUG/d'`,
        hint: `Use: sed '/DEBUG/d' - the d command deletes lines matching the pattern`
    },
    {
        text: 'header line\nrow one\nrow two\nrow three\nfooter line',
        description: 'Using sed, delete lines 2 through 4.',
        solution: `sed '2,4d'`,
        hint: `Use: sed '2,4d' - an address range before d`
    },
    {
        text: 'alpha\nbeta\ngamma\ndelta\nepsilon\nzeta',
        description: 'Using sed, print ONLY lines 2 through 4.',
        solution: `sed -n '2,4p'`,
        hint: `Use: sed -n '2,4p' - -n suppresses default output, p prints the addressed lines`
    },
    {
        text: '/home/alice/notes.txt\n/home/bob/report.pdf\n/home/carol/data.csv',
        description: 'Using sed, replace "/home" with "/users" in each path. Tip: use a delimiter other than "/".',
        solution: `sed 's|/home|/users|'`,
        hint: `Use: sed 's|/home|/users|' - with | as delimiter you don't need to escape slashes`
    },
    {
        text: 'error in module A\nwarning in module B\nerror in module C',
        description: 'Using sed, wrap the word "error" in square brackets: "[error]". The & symbol refers to the matched text.',
        solution: `sed 's/error/[&]/'`,
        hint: `Use: sed 's/error/[&]/' - & stands for whatever the pattern matched`
    },
    {
        text: 'john smith\nanna brown\npeter jones',
        description: 'Using sed with capture groups, swap first and last name on every line.',
        solution: `sed 's/(\\w+) (\\w+)/\\2 \\1/'`,
        hint: `Use: sed 's/(\\w+) (\\w+)/\\2 \\1/' - \\1 and \\2 refer to the captured groups`
    },
    {
        text: 'buy milk\nclean desk\nwrite report',
        description: 'Using sed, add the prefix "TODO: " to the beginning of every line.',
        solution: `sed 's/^/TODO: /'`,
        hint: `Use: sed 's/^/TODO: /' - ^ matches the start of the line`
    },
    {
        text: 'first item\nsecond item\nthird item',
        description: 'Using sed, add a semicolon ";" to the end of every line.',
        solution: `sed 's/$/;/'`,
        hint: `Use: sed 's/$/;/' - $ matches the end of the line`
    },
    {
        text: 'name,city,age\nalice,kyiv,30\nbob,lviv,25\ncarol,odesa,35',
        description: 'Skip the CSV header line and output only the data rows.',
        solution: `tail -n +2`,
        hint: `Use: tail -n +2 - the + means "start AT line 2" instead of "last 2 lines"`
    },
    {
        text: 'service active\nservice inactive\nbackup active\ncache inactive\nproxy active',
        description: 'Find the lines where the whole word "active" appears (must not match "inactive").',
        solution: `grep -w active`,
        hint: `Use: grep -w active - -w matches whole words only`
    },
    {
        text: 'FATAL kernel panic\nINFO all good\nERROR disk fail\nDEBUG verbose\nWARN low memory\nINFO done',
        description: 'Using a single grep, find lines containing "FATAL", "ERROR" or "WARN".',
        solution: `grep -E 'FATAL|ERROR|WARN'`,
        hint: `Use: grep -E 'FATAL|ERROR|WARN' - -E enables | alternation`
    },
    {
        text: 'mixed Case text\nanother Line here\nthird LINE done',
        description: 'Convert all text to UPPERCASE using tr with POSIX character classes.',
        solution: `tr '[:lower:]' '[:upper:]'`,
        hint: `Use: tr '[:lower:]' '[:upper:]'`
    },
    {
        text: 'too    many     spaces\nspaced     out      text\nneat   columns    here',
        description: 'Squeeze every run of repeated spaces into a single space.',
        solution: `tr -s ' '`,
        hint: `Use: tr -s ' ' - -s squeezes repeats of the given character`
    },
    {
        text: 'id,name,dept,salary\n1,alice,eng,100000\n2,bob,sales,80000\n3,carol,eng,120000',
        description: 'Drop the id column: keep every CSV field from the 2nd one to the end.',
        solution: `cut -d',' -f2-`,
        hint: `Use: cut -d',' -f2- - an open-ended field range`
    },
    {
        text: 'walk the dog\nwater the plants\nread a book\ncall grandma',
        description: 'Number every line using nl.',
        solution: `nl`,
        hint: `Use: nl - numbers lines with right-aligned numbers and a tab`
    },
    {
        text: 'red\ngreen\nblue\nyellow',
        description: 'Join all lines into a single comma-separated line.',
        solution: `paste -sd','`,
        hint: `Use: paste -sd',' - -s serializes all lines, -d sets the delimiter`
    },
    {
        text: 'alice 47\nbob 92\ncarol 78\ndave 85\neve 63',
        description: 'Sort by score (2nd space-separated column) from highest to lowest.',
        solution: `sort -k2 -rn`,
        hint: `Use: sort -k2 -rn - -k2 sorts by the 2nd field, -r reverses, -n compares numerically`
    },
    {
        text: 'Apple\napple\nAPPLE\nbanana\nBanana\ncherry',
        description: 'Remove adjacent duplicates treating different letter case as equal.',
        solution: `uniq -i`,
        hint: `Use: uniq -i - -i ignores case when comparing`
    }
];

// --- Real World level: realistic mini-scenarios ----------------------------

const realworld = [
    {
        text: 'GET /index.html 200 12ms\nPOST /api/login 401 88ms\nGET /api/users 500 230ms\nGET /style.css 200 8ms\nPOST /api/orders 500 340ms\nGET /api/health 200 5ms\nGET /favicon.ico 404 3ms\nPOST /api/login 500 120ms',
        description: 'Web server log: count how many requests failed with status 500.',
        solution: `grep ' 500 ' | wc -l`,
        hint: `Use: grep ' 500 ' | wc -l - spaces around 500 avoid matching it inside other numbers`
    },
    {
        text: 'GET /api/users 200\nGET /index.html 200\nGET /api/users 200\nPOST /api/login 200\nGET /api/users 304\nGET /index.html 200\nGET /api/health 200\nGET /api/users 200',
        description: 'Access log: find the most requested endpoint (2nd field) and show it with its hit count.',
        solution: `cut -d' ' -f2 | sort | uniq -c | sort -rn | head -1`,
        hint: `Chain: cut -d' ' -f2 | sort | uniq -c | sort -rn | head -1`
    },
    {
        text: 'Failed password for root from 203.0.113.5\nAccepted password for alice from 10.0.0.3\nFailed password for admin from 203.0.113.5\nFailed password for root from 198.51.100.7\nAccepted publickey for bob from 10.0.0.4\nFailed password for root from 203.0.113.5',
        description: 'SSH auth log: list the source IPs (last field) of FAILED logins, ranked by number of attempts (most frequent first).',
        solution: `grep Failed | awk '{print $NF}' | sort | uniq -c | sort -rn`,
        hint: `Chain: grep Failed | awk '{print $NF}' | sort | uniq -c | sort -rn`
    },
    {
        text: 'root:x:0:0:root:/root:/bin/bash\ndaemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin\nalice:x:1000:1000:Alice:/home/alice:/bin/bash\nbob:x:1001:1001:Bob:/home/bob:/bin/zsh\nbackup:x:34:34:backup:/var/backups:/usr/sbin/nologin\ncarol:x:1002:1002:Carol:/home/carol:/bin/bash',
        description: '/etc/passwd: print the usernames of accounts whose shell is /bin/bash.',
        solution: `grep '/bin/bash' | cut -d':' -f1`,
        hint: `Chain: grep '/bin/bash' | cut -d':' -f1`
    },
    {
        text: 'root:x:0:0:root:/root:/bin/bash\nalice:x:1000:1000:Alice:/home/alice:/bin/bash\nbob:x:1001:1001:Bob:/home/bob:/bin/zsh\ncarol:x:1002:1002:Carol:/home/carol:/bin/bash',
        description: '/etc/passwd: count how many accounts use each shell (7th field), most common first.',
        solution: `cut -d':' -f7 | sort | uniq -c | sort -rn`,
        hint: `Chain: cut -d':' -f7 | sort | uniq -c | sort -rn`
    },
    {
        text: '2024-03-01,alice,laptop,1200\n2024-03-01,bob,phone,800\n2024-03-02,alice,tablet,450\n2024-03-02,carol,laptop,1200\n2024-03-03,bob,monitor,300\n2024-03-03,alice,phone,800',
        description: 'Sales CSV (date,seller,product,amount): compute the total revenue (sum of the 4th field).',
        solution: `awk -F',' '{sum += $4} END {print sum}'`,
        hint: `Use: awk -F',' '{sum += $4} END {print sum}'`
    },
    {
        text: 'alice,engineering,98000\nbob,sales,72000\ncarol,engineering,115000\ndave,marketing,65000\neve,finance,88000',
        description: 'Employee CSV: print only the NAME of the highest-paid person.',
        solution: `sort -t',' -k3 -rn | head -1 | cut -d',' -f1`,
        hint: `Chain: sort -t',' -k3 -rn | head -1 | cut -d',' -f1`
    },
    {
        text: 'web-1 running nginx\ndb-1 exited postgres\nweb-2 running nginx\ncache-1 running redis\nworker-1 exited celery\nweb-3 running nginx',
        description: 'Container list: print the names (1st column) of containers in the "running" state.',
        solution: `grep running | cut -d' ' -f1`,
        hint: `Chain: grep running | cut -d' ' -f1 (awk '{print $1}' works too)`
    },
    {
        text: 'ERROR: failed to bind port\nINFO: server listening\nERROR: failed to bind port\nWARN: high latency\nERROR: out of memory\nINFO: request served\nERROR: failed to bind port',
        description: 'App log: list each distinct ERROR message exactly once (sorted).',
        solution: `grep ERROR | sort -u`,
        hint: `Chain: grep ERROR | sort -u`
    },
    {
        text: 'laptop,electronics,1200,0\nphone,electronics,800,25\ndesk,furniture,340,0\nchair,furniture,150,12\nwebcam,electronics,90,0\nlamp,furniture,45,7',
        description: 'Inventory CSV (product,category,price,stock): print the products that are out of stock (4th field equals 0).',
        solution: `awk -F',' '$4 == 0 {print $1}'`,
        hint: `Use: awk -F',' '$4 == 0 {print $1}'`
    },
    {
        text: 'a1b2c3 alice Fix login bug\nd4e5f6 bob Add dark mode\ng7h8i9 alice Update deps\nj1k2l3 carol Refactor api\nm4n5o6 alice Fix crash\np7q8r9 bob Add tests',
        description: 'Git log (hash author message): count commits per author (2nd field), most active first.',
        solution: `cut -d' ' -f2 | sort | uniq -c | sort -rn`,
        hint: `Chain: cut -d' ' -f2 | sort | uniq -c | sort -rn`
    },
    {
        text: '10.0.0.5\n192.168.1.10\n10.0.0.5\n172.16.0.3\n10.0.0.5\n192.168.1.10\n10.0.0.8',
        description: 'IP hit list: print ONLY the most frequent IP address (just the IP, no count).',
        solution: `sort | uniq -c | sort -rn | head -1 | awk '{print $2}'`,
        hint: `Chain: sort | uniq -c | sort -rn | head -1 | awk '{print $2}'`
    },
    {
        text: 'kyiv,-3\nlviv,2\nodesa,5\nkharkiv,-7\ndnipro,-1\nuzhhorod,4',
        description: 'Weather CSV (city,temp): print the cities with temperatures below zero.',
        solution: `awk -F',' '$2 < 0 {print $1}'`,
        hint: `Use: awk -F',' '$2 < 0 {print $1}'`
    },
    {
        text: 'https://github.com/user/repo\nhttps://docs.python.org/3/tutorial\nhttps://github.com/another/project\nhttps://stackoverflow.com/questions/123\nhttps://github.com/third/thing',
        description: 'URL list: extract just the domain names (3rd "/"-separated field).',
        solution: `cut -d'/' -f3`,
        hint: `Use: cut -d'/' -f3 - with / as delimiter, the domain is field 3`
    },
    {
        text: 'alice@gmail.com\nbob@ukr.net\ncarol@gmail.com\ndave@proton.me\neve@gmail.com\nfrank@ukr.net',
        description: 'Email list: count how many addresses each domain has, most popular first.',
        solution: `cut -d'@' -f2 | sort | uniq -c | sort -rn`,
        hint: `Chain: cut -d'@' -f2 | sort | uniq -c | sort -rn`
    },
    {
        text: 'name,score\nalice,91\nbob,67\ncarol,84\ndave,72',
        description: 'CSV with header: skip the header and sort the data rows by score (2nd field) in descending numeric order.',
        solution: `tail -n +2 | sort -t',' -k2 -rn`,
        hint: `Chain: tail -n +2 | sort -t',' -k2 -rn`
    },
    {
        text: 'nginx 2.1\npostgres 8.4\nredis 1.2\nnode 5.7\nelasticsearch 12.3\ncron 0.1',
        description: 'Memory usage (process percent): show the top 3 processes by memory, highest first.',
        solution: `sort -k2 -rn | head -3`,
        hint: `Chain: sort -k2 -rn | head -3`
    },
    {
        text: '2024-03-01 09:14 ERROR timeout\n2024-03-01 11:02 ERROR oom\n2024-03-02 08:55 ERROR timeout\n2024-03-02 14:21 ERROR disk\n2024-03-02 19:03 ERROR timeout\n2024-03-03 07:48 ERROR oom',
        description: 'Error log: count how many errors happened on each date (1st field), busiest day first.',
        solution: `cut -d' ' -f1 | sort | uniq -c | sort -rn`,
        hint: `Chain: cut -d' ' -f1 | sort | uniq -c | sort -rn`
    },
    {
        text: '# Server configuration\nport=8080\n# Enable TLS\ntls=true\nhost=0.0.0.0\n# Workers\nworkers=4',
        description: 'Config file: output only the real settings - remove every comment line (lines starting with "#").',
        solution: `grep -v '^#'`,
        hint: `Use: grep -v '^#'`
    },
    {
        text: '- [x] write spec\n- [ ] implement parser\n- [x] add tests\n- [ ] update docs\n- [ ] release v2',
        description: 'Markdown checklist: count how many tasks are still unchecked ("[ ]").',
        solution: `grep -c '\\[ \\]'`,
        hint: `Use: grep -c '\\[ \\]' - the brackets need escaping with backslashes`
    },
    {
        text: 'alice,math,90\nalice,physics,85\nbob,math,70\nbob,physics,80\ncarol,math,95\ncarol,physics,75',
        description: 'Grades CSV (name,subject,grade): compute the average of ALL grades (3rd field).',
        solution: `awk -F',' '{s += $3} END {print s/NR}'`,
        hint: `Use: awk -F',' '{s += $3} END {print s/NR}'`
    },
    {
        text: 'GET /a 200 15ms\nPOST /b 200 320ms\nGET /c 200 8ms\nGET /d 200 540ms\nPUT /e 200 95ms',
        description: 'Access log: find the slowest response time in milliseconds (4th field, just the number).',
        solution: `cut -d' ' -f4 | tr -d 'ms' | sort -n | tail -1`,
        hint: `Chain: cut -d' ' -f4 | tr -d 'ms' | sort -n | tail -1`
    },
    {
        text: '/var/log/syslog\n/home/alice/notes.txt\n/var/log/nginx/access.log\n/etc/hosts\n/var/log/auth.log\n/tmp/build.log',
        description: 'File list: show only the files ending in ".log".',
        solution: `grep '\\.log$'`,
        hint: `Use: grep '\\.log$' - escape the dot, anchor with $`
    },
    {
        text: 'monday 1240\ntuesday 980\nwednesday 1430\nthursday 1100\nfriday 1670',
        description: 'Daily backup sizes in MB: compute the total size of all backups (sum of the 2nd column).',
        solution: `awk '{sum += $2} END {print sum}'`,
        hint: `Use: awk '{sum += $2} END {print sum}'`
    },
    {
        text: 'alice opened dashboard\nbob updated profile\nalice exported report\ncarol opened dashboard\nbob logged out\nalice logged out',
        description: 'Activity log: print the sorted list of unique users (1st field).',
        solution: `cut -d' ' -f1 | sort -u`,
        hint: `Chain: cut -d' ' -f1 | sort -u`
    },
    {
        text: 'GET 200\nPOST 201\nGET 404\nGET 200\nPOST 500\nGET 200\nDELETE 204\nGET 404',
        description: 'Status codes (2nd field): rank them by frequency, most common first.',
        solution: `cut -d' ' -f2 | sort | uniq -c | sort -rn`,
        hint: `Chain: cut -d' ' -f2 | sort | uniq -c | sort -rn`
    },
    {
        text: 'alice 87\nbob 92\ncarol 78\ndave 95\neve 81\nfrank 89',
        description: 'Leaderboard: print the names of the top 3 scorers, best first.',
        solution: `sort -k2 -rn | head -3 | cut -d' ' -f1`,
        hint: `Chain: sort -k2 -rn | head -3 | cut -d' ' -f1`
    },
    {
        text: 'web-1 healthy\nweb-2 unhealthy\ndb-1 healthy\ncache-1 unhealthy\nweb-3 healthy\nqueue-1 unhealthy',
        description: 'Health checks: count the "unhealthy" services using a whole-word match (must not count "healthy").',
        solution: `grep -cw unhealthy`,
        hint: `Use: grep -cw unhealthy - combine -c (count) and -w (whole word)`
    },
    {
        text: '512 /var/log/syslog\n2048 /var/backups/db.tar.gz\n128 /etc/hosts\n4096 /var/backups/full.tar.gz\n256 /tmp/build.log',
        description: 'Disk usage (size path): print the path (2nd field) of the largest file.',
        solution: `sort -k1 -rn | head -1 | awk '{print $2}'`,
        hint: `Chain: sort -k1 -rn | head -1 | awk '{print $2}'`
    },
    {
        text: 'feature/login\nbugfix/crash\nfeature/search\nchore/deps\nfeature/export\nbugfix/timeout',
        description: 'Git branches: count how many branches each prefix (text before "/") has, most common first.',
        solution: `cut -d'/' -f1 | sort | uniq -c | sort -rn`,
        hint: `Chain: cut -d'/' -f1 | sort | uniq -c | sort -rn`
    }
];

function build(tasks, name) {
    const out = tasks.map((t, i) => {
        let expected;
        try {
            expected = executePipeline(t.text, t.solution);
        } catch (e) {
            console.error(`${name} #${i + 1}: solution failed: ${t.solution} -> ${e.message}`);
            process.exit(1);
        }
        if (!expected.trim()) {
            console.error(`${name} #${i + 1}: solution produced empty output: ${t.solution}`);
            process.exit(1);
        }
        if (expected.trim() === t.text.trim()) {
            console.error(`${name} #${i + 1}: solution is a no-op: ${t.solution}`);
            process.exit(1);
        }
        return {
            text: t.text,
            description: t.description,
            expected,
            hint: t.hint
        };
    });
    writeFileSync(`data/${name}.json`, JSON.stringify(out, null, 4) + '\n');
    console.log(`data/${name}.json: ${out.length} challenges`);
}

build(master, 'master');
build(realworld, 'realworld');
