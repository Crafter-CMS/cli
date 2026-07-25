import * as semver from 'semver';

export class SemverUtil {
    static isValid(version: string): boolean {
        return semver.valid(version) !== null;
    }

    static clean(version: string): string | null {
        return semver.clean(version);
    }
}
