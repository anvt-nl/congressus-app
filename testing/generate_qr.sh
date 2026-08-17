#!/usr/bin/env bash
for file in get_participation_*.json; do
    # Extract the base filename without extension
    basename="${file%.json}"
    
    # Extract and decode the QR code
    jq -r '.tickets[0].ticket_qrcode' "$file" | \
        sed 's/data:image\/png;base64,//' | \
        base64 -d > "${basename}_qrcode.png"
    
    echo "Created ${basename}_qrcode.png"
done
