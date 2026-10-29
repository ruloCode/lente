# Serving the phone page over HTTPS on the LAN

Browsers open the microphone and camera only in a secure context: `localhost` or HTTPS. To use the phone as the device (`add-phone-capture`) while the hub runs on another machine, give the hub a certificate the phone trusts.

1. On the Mac: `brew install mkcert` then `mkcert -install` (creates a local certificate authority).
2. Make a certificate for the hub's LAN address (the hub prints it as `Phone: …`):
   `mkcert -cert-file data/lan.pem -key-file data/lan-key.pem 192.168.0.170 localhost`
   (`data/` is git-ignored; never commit the key).
3. Install the authority on the phone: copy `$(mkcert -CAROOT)/rootCA.pem` to it and add it under Settings → Security → Encryption & credentials → Install a certificate → CA certificate.
4. Start the hub with both variables: `PILOT_TLS_CERT=data/lan.pem PILOT_TLS_KEY=data/lan-key.pem pnpm pilot`. It prints `Phone: https://…`. Setting only one of the two is an error.

A certificate the phone does not trust does not work: Chrome treats the page as insecure even after "Continue", so the microphone stays blocked.
