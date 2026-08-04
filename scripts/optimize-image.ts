const inputPath = "apps/web/public/icon.png";
const outputPath = "apps/web/public/icon.webp";

const input = Bun.file(inputPath);

if (!(await input.exists())) {
    throw new Error(`Image not found: ${inputPath}`);
}

const bytesWritten = await input
    .image({
        autoOrient: true,
        maxPixels: 20_000_000,
    })
    .webp({
        quality: 80,
        lossless: false,
    })
    .write(outputPath);

console.log(`Generated ${outputPath} (${bytesWritten} bytes)`);
