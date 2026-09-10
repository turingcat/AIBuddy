#!/usr/bin/env node

/**
 * Script to unregister ALL aibuddy:// protocol handlers
 * Usage: node scripts/unregister-deeplink-protocols.js
 */

const { execSync } = require('child_process');

const PROTOCOL = 'aibuddy';

function unregisterAllProtocolHandlers() {
  console.log('Unregistering ALL aibuddy:// protocol handlers...');
  
  try {
    // Get all registered AIBuddy apps
    console.log('Finding all registered AIBuddy applications...');
    const lsregisterOutput = execSync(`/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister -dump | grep -B 10 -A 10 "claimed schemes:.*${PROTOCOL}:"`, { encoding: 'utf8' });
    
    // Extract app paths from the output
    const pathMatches = lsregisterOutput.match(/path:\s+(.+\.app)/g);
    const uniquePaths = new Set();
    
    if (pathMatches) {
      pathMatches.forEach(match => {
        const path = match.replace(/path:\s+/, '').trim();
        if (path.includes('AIBuddy') || path.includes('aibuddy')) {
          uniquePaths.add(path);
        }
      });
    }
    
    console.log(`Found ${uniquePaths.size} AIBuddy app(s) to unregister:`);
    uniquePaths.forEach(path => console.log(`  - ${path}`));
    
    // Unregister each app
    let unregisteredCount = 0;
    uniquePaths.forEach(appPath => {
      try {
        console.log(`Unregistering: ${appPath}`);
        execSync(`/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister -u "${appPath}"`, { stdio: 'ignore' });
        unregisteredCount++;
      } catch (error) {
        console.log(`  Warning: Could not unregister ${appPath} (may already be unregistered)`);
      }
    });
    
    // Also try to unregister by bundle identifier
    console.log('\nUnregistering by bundle identifier...');
    const bundleIds = [
      'com.electron.aibuddy',
      'com.block.aibuddy',
      'com.block.aibuddy.dev'
    ];
    
    bundleIds.forEach(bundleId => {
      try {
        console.log(`Unregistering bundle: ${bundleId}`);
        execSync(`/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister -u "${bundleId}"`, { stdio: 'ignore' });
      } catch (error) {
        // Ignore errors for bundle IDs that don't exist
      }
    });
    
    // Force Launch Services to rebuild its database
    console.log('Rebuilding Launch Services database...');
    try {
      execSync('/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister -kill -r -domain local -domain system -domain user', { stdio: 'ignore' });
    } catch (error) {
      console.log('Warning: Could not rebuild Launch Services database');
    }
    
    console.log(`\n✅ Successfully processed ${unregisteredCount} AIBuddy applications`);
    console.log('All aibuddy:// protocol handlers have been unregistered.');
    console.log('\nNote: You may need to restart your system for changes to take full effect.');
    
  } catch (error) {
    console.error('Error during unregistration:', error.message);
    console.log('\nManual cleanup options:');
    console.log('1. Use Activity Monitor to quit all AIBuddy processes');
    console.log('2. Delete AIBuddy apps from Applications folder');
    console.log('3. Run: sudo /System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister -kill -r -domain local -domain system -domain user');
  }
}

// Run the unregistration immediately
unregisterAllProtocolHandlers();
