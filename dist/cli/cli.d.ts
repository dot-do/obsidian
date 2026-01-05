export interface CliResult {
    exitCode: number;
    stdout: string;
    stderr: string;
}
export interface CliOptions {
    vaultPath?: string;
}
/**
 * Run the obsidian.do CLI with the given arguments
 * @param args - Command line arguments (without 'obsidian' prefix)
 * @param options - CLI options including vault path
 * @returns CLI result with exit code, stdout, and stderr
 */
export declare function runCli(args: string[], options?: CliOptions): Promise<CliResult>;
//# sourceMappingURL=cli.d.ts.map