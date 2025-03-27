import { ensureDir, exists } from '@std/fs';
import { join } from '@std/path';
import { compare, parse } from '@std/semver';
import { build, stop } from 'esbuild';
import config from './deno.json' with { type: 'json' };

/* -------------------------------
   Plugin Bundling Section
   ------------------------------- */

async function bundlePlugin(): Promise<void> {
    // Check if the TSX file exists; if not, fall back to TS.
    const tsFile = 'src\\plugin.ts';
    const tsxFile = `${tsFile}x`;
    const inFile = (await exists(tsxFile)) ? tsxFile : tsFile;
    console.log(`Building plugin from: ${inFile}`);

    const outFile = join('dist', `${config.meta.name}.plugin.js`);

    await build({
        entryPoints: [inFile],
        bundle: true,
        outfile: outFile,
        format: 'cjs',
        target: ['esnext'],
        minify: true,
        banner: { js: generateMetaHeader(config.meta) },
    });
    await stop();

    console.log(`✅ Plugin bundle complete: ${outFile}`);

    copyToBD(outFile);
}

function generateMetaHeader(meta: Record<string, unknown>): string {
    return `/**\n${
        Object.entries(meta)
            .map(([key, value]) => ` * @${key} ${value}`)
            .join('\n')
    }\n*/\n`;
}

async function copyToBD(outFile: string): Promise<void> {
    // Determine the user's config folder based on the operating system.
    let userConfig: string;
    if (Deno.build.os === 'windows') {
        userConfig = Deno.env.get('APPDATA') || '';
    } else if (Deno.build.os === 'darwin') {
        userConfig = join(
            Deno.env.get('HOME')!,
            'Library',
            'Application Support',
        );
    } else {
        userConfig = Deno.env.get('XDG_CONFIG_HOME') ||
            join(Deno.env.get('HOME')!, '.config');
    }

    // Ensure the BetterDiscord folder and the plugins subfolder exist.
    const pluginsFolder = join(userConfig, 'BetterDiscord', 'plugins');
    await ensureDir(pluginsFolder);

    // Copy the bundled plugin file to the destination folder.
    const destPath = join(pluginsFolder, outFile.split('\\').pop()!);
    await Deno.copyFile(outFile, destPath);

    console.log(`✅ Copied to BD plugins folder at: ${destPath}`);
}

/* -------------------------------
   Changelog/README Update Section
   ------------------------------- */

async function updateChangelog(): Promise<void> {
    console.log('Processing CHANGELOG.md...');

    // Extract the version and entry text from the changelog.
    const { version, entry } = await extractChangelog();
    await updateReadmeChangelog(entry);

    // Verify that the changelog version meets the project version requirement.
    enforceChangelogVersion(version);

    console.log(`✅ Changelog update complete: ${version}`);
}

async function extractChangelog(): Promise<{ version: string; entry: string }> {
    const changelog = await Deno.readTextFile('CHANGELOG.md');

    // Look for the first header that matches "## [version]"
    const headerRegex = /^## \[([^\]]+)\]/m;
    const headerMatch = headerRegex.exec(changelog);
    if (!headerMatch) {
        throw new Error(
            "No changelog header found. Expected a line like '## [version]'.",
        );
    }
    const version = headerMatch[1].trim();

    // Gather the changelog entry from the header until the next header starting with "## "
    const lines = changelog.split('\n');
    const startIndex = lines.findIndex((line) => headerRegex.test(line));
    if (startIndex === -1) {
        throw new Error('Changelog header not found in file lines.');
    }

    // Collect all lines starting at the header until the next header is encountered.
    const entryLines: string[] = [];
    for (let i = startIndex; i < lines.length; i++) {
        // Stop if we hit another header (after the first line)
        if (i > startIndex && /^## /.test(lines[i])) break;
        entryLines.push(lines[i]);
    }
    const entry = entryLines.join('\n');
    return { version, entry };
}

async function updateReadmeChangelog(entry: string): Promise<void> {
    const readmePath = 'README.md';
    const readmeContent = await Deno.readTextFile(readmePath);
    const startMarker = '<!-- CHANGELOG_START -->';
    const endMarker = '<!-- CHANGELOG_END -->';

    const startIdx = readmeContent.indexOf(startMarker);
    const endIdx = readmeContent.indexOf(endMarker);
    if (startIdx === -1 || endIdx === -1) {
        throw new Error('CHANGELOG markers not found in README.md');
    }
    if (startIdx + startMarker.length > endIdx) {
        throw new Error('Invalid marker order in README.md');
    }

    // Updates README.md by replacing content between CHANGELOG markers with the new changelog entry.
    const before = readmeContent.slice(0, startIdx + startMarker.length);
    const after = readmeContent.slice(endIdx);
    const newContent = `${before}\n\n${entry}\n${after}`;
    await Deno.writeTextFile(readmePath, newContent);
}

function enforceChangelogVersion(changelogVersion: string): void {
    const projectVersion = config.meta.version;
    // Ensures that the changelog version is at least equal to the project version.
    try {
        const changelogSemver = parse(changelogVersion);
        const projectSemver = parse(projectVersion);
        if (compare(changelogSemver, projectSemver) < 0) {
            throw new Error(
                `Changelog version (${changelogVersion}) must be greater than or equal to project version (${projectVersion}).`,
            );
        }
    } catch (error) {
        throw new Error(`Failed to parse version: ${error}`);
    }
}

/* -------------------------------
   Main Build Function
   ------------------------------- */

async function main(): Promise<void> {
    await Promise.all([
        // Bundle the plugin.
        bundlePlugin(),

        // Update the changelog in the README.
        updateChangelog(),
    ]);
}

if (import.meta.main) {
    try {
        await main();
    } catch (err) {
        console.error('Build failed:', err);
        Deno.exit(1);
    }
}
