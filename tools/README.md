# tools/

Utilidades locales de build (no se versionan los JDK).

## JDK 21 (Android / Capacitor 7)

Si no tienes `openjdk-21` en el sistema:

```bash
cd tools
curl -fsSL -o jdk21.tar.gz \
  "https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse?project=jdk"
tar -xzf jdk21.tar.gz
mv jdk-21* jdk-21
rm jdk21.tar.gz
```

`mobile/scripts/build-apk.sh` usa automáticamente `tools/jdk-21` si existe.
