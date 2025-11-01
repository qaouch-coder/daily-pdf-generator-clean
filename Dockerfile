# Use official Node.js image
FROM ghcr.io/puppeteer/puppeteer:24.2.0

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy app source
COPY . .

# Run Puppeteer script
CMD ["node", "generate_daily_pdfs.mjs"]
