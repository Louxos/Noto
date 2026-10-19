# Signature de l’installeur Windows

**État :** le workflow de publication sait signer l’installeur NSIS avec Authenticode, puis vérifier la signature avant de calculer SHA-256. La signature n’est produite que lorsqu’un certificat valide est configuré ; aucune clé ni aucun certificat n’est conservé dans le dépôt. Une somme SHA-256 vérifie l’intégrité du fichier, mais ne remplace pas une signature d’éditeur.

Le workflow `.github/workflows/release.yml` attend ces deux secrets d’Actions :

- `NOTO_WINDOWS_SIGNING_CERTIFICATE_BASE64` — certificat de signature Windows au format PFX encodé en Base64 ;
- `NOTO_WINDOWS_SIGNING_CERTIFICATE_PASSWORD` — mot de passe du PFX.

Si les deux secrets Authenticode sont absents, les installeurs restent sans signature d’éditeur et le journal l’annonce. Si un seul secret est présent, le build échoue volontairement : une configuration incomplète ne doit pas produire une publication ambiguë.

## Signature de l’updater Tauri

La signature Authenticode ci-dessus est distincte de la signature cryptographique utilisée par l’updater. Tout **tag de release** exige les secrets `TAURI_SIGNING_PRIVATE_KEY` et `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` dans **Settings → Secrets and variables → Actions**. Sans eux, le workflow refuse de construire et publier la release signée. Les builds de branche ne reçoivent pas la clé privée et ne produisent pas d’artefacts de mise à jour.

La clé privée Tauri doit rester réservée aux secrets Actions et hors du dépôt. Elle ne doit jamais apparaître dans une issue ou une conversation. L’artefact final est re-signé après l’étape Authenticode, afin que la signature de mise à jour couvre les octets exacts publiés ; le workflow publie également le manifeste Tauri et la somme SHA-256.

## Configuration par le propriétaire du dépôt

1. Obtenir un certificat Authenticode valide auprès d’une autorité de certification et exporter une copie PFX réservée à la publication. Un certificat auto-signé ne donne pas une identité de publication approuvée par Windows SmartScreen.
2. Encoder le PFX localement, sans le déposer dans Git ni le transmettre dans une issue ou une conversation :

   ```powershell
   $pfx = [IO.File]::ReadAllBytes('.\noto-code-signing.pfx')
   [Convert]::ToBase64String($pfx) | Set-Clipboard
   ```

3. Dans le dépôt GitHub : **Settings → Secrets and variables → Actions → New repository secret**. Ajouter les deux noms ci-dessus ; coller le Base64 dans le premier, puis saisir le mot de passe du PFX dans le second. N’ajouter ni le PFX, ni son mot de passe aux fichiers du dépôt.
4. Publier une nouvelle version. Le workflow signe les `.exe` avec SHA-256, utilise un horodatage RFC 3161 puis vérifie Authenticode avant de calculer les empreintes des fichiers distribués.
5. Après publication, vérifier le binaire téléchargé :

   ```powershell
   Get-AuthenticodeSignature .\Noto_1.x.y_x64-setup.exe | Format-List Status, SignerCertificate
   Get-FileHash .\Noto_1.x.y_x64-setup.exe -Algorithm SHA256
   ```

Le certificat et les secrets restent sous le contrôle du propriétaire du dépôt ; il n’est jamais nécessaire de partager le certificat ou le mot de passe dans une conversation ou une issue publique.

Une version déjà publiée n’est jamais modifiée ni resignée sur place : la signature prend effet sur les versions publiées après la configuration.
