class GitHubSuperStats {
  constructor() {
    this.apiBaseUrl = 'https://api.github.com';
    this.cacheExpiry = 3600000; // 1 hour
    this.currentPath = '';
    this.observer = null;
  }

  async init() {
    if (!this.isGitHubRepoPage()) return;

    // Track URL changes for SPA navigation
    if (window.location.pathname !== this.currentPath) {
      this.currentPath = window.location.pathname;
      await this.processRepo();
    }

    // Setup observer for dynamic content
    if (!this.observer) {
      this.setupObserver();
    }
  }

  setupObserver() {
    this.observer = new MutationObserver(() => {
      if (!document.querySelector('#github-superstats-panel')) {
        this.processRepo();
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  async processRepo() {
    try {
      const repoInfo = this.extractRepoInfo();
      if (!repoInfo.owner || !repoInfo.repo) return;

      const cachedData = await this.getCachedData(repoInfo);

      if (cachedData) {
        this.renderPanel(cachedData);
      } else {
        const repoStats = await this.fetchRepoStats(repoInfo);
        this.renderPanel(repoStats);
        this.cacheData(repoInfo, repoStats);
      }
    } catch (error) {
      this.handleError(error);
    }
  }

  isGitHubRepoPage() {
    return window.location.hostname === 'github.com' &&
           window.location.pathname.split('/').filter(Boolean).length >= 2;
  }

  extractRepoInfo() {
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    return {
      owner: pathParts[0],
      repo: pathParts[1]
    };
  }

  async fetchRepoStats({ owner, repo }) {
    const repoResponse = await fetch(`${this.apiBaseUrl}/repos/${owner}/${repo}`);

    // Handle rate limits
    if (repoResponse.status === 403) {
      const resetTime = parseInt(repoResponse.headers.get('X-RateLimit-Reset')) * 1000;
      const waitMinutes = Math.ceil((resetTime - Date.now()) / 60000);
      throw new Error(`GitHub API limit exceeded. Try again in ${waitMinutes} minutes`);
    }

    if (!repoResponse.ok) {
      throw new Error('Failed to fetch repository data');
    }

    const repoData = await repoResponse.json();

    return {
      stars: repoData.stargazers_count || 0,
      forks: repoData.forks_count || 0,
      issues: repoData.open_issues_count || 0,
      defaultBranch: repoData.default_branch || 'main',
      repoValue: this.calculateRepoValue(repoData.stargazers_count, repoData.forks_count),
      maintenanceHours: this.calcMaintenanceHours(repoData.open_issues_count),
      dependencies: await this.scanDependencies(owner, repo, repoData.default_branch)
    };
  }

  calculateRepoValue(stars, forks) {
    return (stars * forks * 0.10).toFixed(2);
  }

  calcMaintenanceHours(issues) {
    // Includes both issues and PRs
    return (issues * 0.3).toFixed(1);
  }

  async scanDependencies(owner, repo, defaultBranch = 'main') {
    try {
      const response = await fetch(
        `${this.apiBaseUrl}/repos/${owner}/${repo}/contents/package.json?ref=${defaultBranch}`,
        { headers: { Accept: 'application/vnd.github.v3.raw' } }
      );

      if (!response.ok) return 0; // No package.json

      const packageJson = await response.json();
      return Object.keys({
        ...(packageJson.dependencies || {}),
        ...(packageJson.devDependencies || {})
      }).length;
    } catch {
      return 0;
    }
  }

  async getCachedData(repoInfo) {
    const cacheKey = `github_superstats_${repoInfo.owner}_${repoInfo.repo}`;
    const result = await chrome.storage.local.get(cacheKey);
    const cachedItem = result[cacheKey];

    if (cachedItem && (Date.now() - cachedItem.timestamp < this.cacheExpiry)) {
      return cachedItem.data;
    }
    return null;
  }

  async cacheData(repoInfo, data) {
    const cacheKey = `github_superstats_${repoInfo.owner}_${repoInfo.repo}`;
    await chrome.storage.local.set({
      [cacheKey]: {
        timestamp: Date.now(),
        data
      }
    });
  }

  renderPanel(stats) {
    // Remove existing panel if any
    const existingPanel = document.getElementById('github-superstats-panel');
    if (existingPanel) existingPanel.remove();

    // Create secure DOM elements
    const panelContainer = document.createElement('div');
    panelContainer.id = 'github-superstats-panel';

    const header = document.createElement('div');
    header.className = 'superstats-header';
    header.textContent = 'GitHub SuperStats';

    const content = document.createElement('div');
    content.className = 'superstats-content';

    // Value item
    const valueItem = this.createStatItem(
      '🚀 Estimated Value:',
      `$${stats.repoValue}`
    );

    // Maintenance item
    const maintenanceItem = this.createStatItem(
      '⏳ Monthly Maintenance:',
      `${stats.maintenanceHours} hrs`
    );

    // Dependency item
    const dependencyItem = this.createStatItem(
      '📦 Dependencies:',
      stats.dependencies.toString()
    );

    // Support button
    const supportBtn = document.createElement('a');
    supportBtn.href = 'https://ko-fi.com/trustniroula';
    supportBtn.className = 'support-btn';
    supportBtn.target = '_blank';
    supportBtn.textContent = '☕ Support Maintainer';

    // Assemble components
    content.appendChild(valueItem);
    content.appendChild(maintenanceItem);
    content.appendChild(dependencyItem);
    content.appendChild(supportBtn);

    panelContainer.appendChild(header);
    panelContainer.appendChild(content);

    // Insert into page
    const repohead = document.querySelector('.repohead') || document.querySelector('.Layout-main');
    if (repohead) {
      repohead.appendChild(panelContainer);
    } else {
      document.body.appendChild(panelContainer);
    }
  }

  createStatItem(label, value) {
    const container = document.createElement('div');
    container.className = 'stat-item';

    const labelSpan = document.createElement('span');
    labelSpan.textContent = label;

    const valueStrong = document.createElement('strong');
    valueStrong.textContent = value;

    container.appendChild(labelSpan);
    container.appendChild(valueStrong);
    return container;
  }

  handleError(error) {
    console.error('GitHub SuperStats Error:', error);

    // Remove existing error if any
    const existingError = document.getElementById('github-superstats-error');
    if (existingError) existingError.remove();

    const errorContainer = document.createElement('div');
    errorContainer.id = 'github-superstats-error';

    const errorMsg = document.createElement('div');
    errorMsg.className = 'error-message';
    errorMsg.textContent = error.message || '⚠️ Unable to fetch repository stats';

    errorContainer.appendChild(errorMsg);
    document.body.appendChild(errorContainer);

    // Auto-remove error after 10 seconds
    setTimeout(() => {
      errorContainer.remove();
    }, 10000);
  }
}

// Initialize on load and observe for SPA changes
const superStats = new GitHubSuperStats();
document.addEventListener('DOMContentLoaded', () => superStats.init());
window.addEventListener('popstate', () => superStats.init());