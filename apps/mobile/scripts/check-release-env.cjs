const {resolveMobileConfig}=require('./release-config.cjs');
const config=resolveMobileConfig();
if(!config.release)throw new Error('Set CABO_RELEASE_BUILD=1 when checking an installable build.');
console.log(`Release configuration verified: API ${config.api}, links ${config.app}; EAS project configured.`);
