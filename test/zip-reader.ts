/** Testler için minimal ZIP okuyucu: merkezi dizindeki dosya adlarını döner */
export default function listZipEntries(buf: Buffer): string[] {
    const EOCD = 0x06054b50;
    let eocd = -1;
    for (let i = buf.length - 22; i >= 0; i--) {
        if (buf.readUInt32LE(i) === EOCD) {
            eocd = i;
            break;
        }
    }
    if (eocd < 0) throw new Error('EOCD not found');
    const count = buf.readUInt16LE(eocd + 10);
    let offset = buf.readUInt32LE(eocd + 16);
    const names: string[] = [];
    for (let n = 0; n < count; n++) {
        const nameLen = buf.readUInt16LE(offset + 28);
        const extraLen = buf.readUInt16LE(offset + 30);
        const commentLen = buf.readUInt16LE(offset + 32);
        names.push(buf.toString('utf8', offset + 46, offset + 46 + nameLen));
        offset += 46 + nameLen + extraLen + commentLen;
    }
    return names;
}
