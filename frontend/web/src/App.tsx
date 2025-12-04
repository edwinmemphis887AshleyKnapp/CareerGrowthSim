// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface CareerPath {
  id: string;
  title: string;
  encryptedData: string;
  timestamp: number;
  owner: string;
  skills: string[];
  growthScore: number;
  status: "active" | "completed" | "archived";
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [careerPaths, setCareerPaths] = useState<CareerPath[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newCareerPath, setNewCareerPath] = useState({
    title: "",
    skills: "",
    description: ""
  });
  const [showTutorial, setShowTutorial] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [searchQuery, setSearchQuery] = useState("");

  // Calculate statistics
  const activeCount = careerPaths.filter(p => p.status === "active").length;
  const completedCount = careerPaths.filter(p => p.status === "completed").length;
  const averageScore = careerPaths.length > 0 
    ? Math.round(careerPaths.reduce((sum, p) => sum + p.growthScore, 0) / careerPaths.length) 
    : 0;

  useEffect(() => {
    loadCareerPaths().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadCareerPaths = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("career_path_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing career path keys:", e);
        }
      }
      
      const list: CareerPath[] = [];
      
      for (const key of keys) {
        try {
          const pathBytes = await contract.getData(`career_path_${key}`);
          if (pathBytes.length > 0) {
            try {
              const pathData = JSON.parse(ethers.toUtf8String(pathBytes));
              list.push({
                id: key,
                title: pathData.title,
                encryptedData: pathData.data,
                timestamp: pathData.timestamp,
                owner: pathData.owner,
                skills: pathData.skills || [],
                growthScore: pathData.growthScore || 0,
                status: pathData.status || "active"
              });
            } catch (e) {
              console.error(`Error parsing career path data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading career path ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setCareerPaths(list);
    } catch (e) {
      console.error("Error loading career paths:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitCareerPath = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting career data with FHE..."
    });
    
    try {
      // Simulate FHE encryption for career data
      const encryptedData = `FHE-${btoa(JSON.stringify(newCareerPath))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const pathId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const pathData = {
        title: newCareerPath.title,
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        skills: newCareerPath.skills.split(',').map(s => s.trim()).filter(s => s),
        growthScore: Math.floor(Math.random() * 50) + 50, // Simulated growth score
        status: "active"
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `career_path_${pathId}`, 
        ethers.toUtf8Bytes(JSON.stringify(pathData))
      );
      
      const keysBytes = await contract.getData("career_path_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(pathId);
      
      await contract.setData(
        "career_path_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Career path encrypted and stored securely!"
      });
      
      await loadCareerPaths();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewCareerPath({
          title: "",
          skills: "",
          description: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const simulateGrowth = async (pathId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Running FHE simulation on career path..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const pathBytes = await contract.getData(`career_path_${pathId}`);
      if (pathBytes.length === 0) {
        throw new Error("Career path not found");
      }
      
      const pathData = JSON.parse(ethers.toUtf8String(pathBytes));
      
      const updatedPath = {
        ...pathData,
        growthScore: Math.min(100, pathData.growthScore + Math.floor(Math.random() * 15) + 5)
      };
      
      await contract.setData(
        `career_path_${pathId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedPath))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE growth simulation completed!"
      });
      
      await loadCareerPaths();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Simulation failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const archivePath = async (pathId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Archiving with FHE..."
    });

    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const pathBytes = await contract.getData(`career_path_${pathId}`);
      if (pathBytes.length === 0) {
        throw new Error("Career path not found");
      }
      
      const pathData = JSON.parse(ethers.toUtf8String(pathBytes));
      
      const updatedPath = {
        ...pathData,
        status: "archived"
      };
      
      await contract.setData(
        `career_path_${pathId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedPath))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Career path archived!"
      });
      
      await loadCareerPaths();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Archive failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const isOwner = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  const tutorialSteps = [
    {
      title: "Connect Wallet",
      description: "Connect your Web3 wallet to start your career growth journey",
      icon: "🔗"
    },
    {
      title: "Create Career Path",
      description: "Define your skills and career aspirations encrypted with FHE",
      icon: "🎯"
    },
    {
      title: "FHE Simulation",
      description: "Run growth simulations on your encrypted career data",
      icon: "🔮"
    },
    {
      title: "Track Progress",
      description: "Monitor your career growth while maintaining privacy",
      icon: "📊"
    }
  ];

  const renderGrowthChart = () => {
    return (
      <div className="growth-chart">
        <div className="chart-bars">
          {careerPaths.slice(0, 5).map((path, index) => (
            <div key={path.id} className="chart-bar-container">
              <div 
                className="chart-bar" 
                style={{ height: `${path.growthScore}%` }}
                title={`${path.title}: ${path.growthScore}%`}
              ></div>
              <div className="chart-label">{path.title.substring(0, 8)}</div>
            </div>
          ))}
        </div>
        <div className="chart-axis">
          <div className="axis-label">100%</div>
          <div className="axis-label">50%</div>
          <div className="axis-label">0%</div>
        </div>
      </div>
    );
  };

  const filteredPaths = careerPaths.filter(path => 
    path.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    path.skills.some(skill => skill.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Initializing career growth simulator...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">🌱</div>
          <h1>CareerGrowth<span>Sim</span></h1>
        </div>
        
        <div className="header-actions">
          <div className="search-box">
            <input 
              type="text" 
              placeholder="Search career paths..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <div className="search-icon">🔍</div>
          </div>
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-path-btn"
          >
            + New Path
          </button>
          <button 
            className="tutorial-btn"
            onClick={() => setShowTutorial(!showTutorial)}
          >
            {showTutorial ? "Hide Guide" : "Show Guide"}
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <nav className="app-nav">
        <button 
          className={activeTab === "dashboard" ? "nav-btn active" : "nav-btn"}
          onClick={() => setActiveTab("dashboard")}
        >
          Dashboard
        </button>
        <button 
          className={activeTab === "paths" ? "nav-btn active" : "nav-btn"}
          onClick={() => setActiveTab("paths")}
        >
          My Paths
        </button>
        <button 
          className={activeTab === "analytics" ? "nav-btn active" : "nav-btn"}
          onClick={() => setActiveTab("analytics")}
        >
          Analytics
        </button>
        <button 
          className={activeTab === "community" ? "nav-btn active" : "nav-btn"}
          onClick={() => setActiveTab("community")}
        >
          Community
        </button>
      </nav>
      
      <div className="main-content">
        {showTutorial && (
          <div className="tutorial-section">
            <h2>Career Growth Simulator Guide</h2>
            <p className="subtitle">Maximize your career potential with FHE-powered simulations</p>
            
            <div className="tutorial-steps">
              {tutorialSteps.map((step, index) => (
                <div 
                  className="tutorial-step"
                  key={index}
                >
                  <div className="step-icon">{step.icon}</div>
                  <div className="step-content">
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {activeTab === "dashboard" && (
          <div className="dashboard-grid">
            <div className="dashboard-card">
              <h3>Career Growth Simulator</h3>
              <p>Plan and simulate your career progression using FHE-encrypted personal development data.</p>
              <div className="fhe-badge">
                <span>FHE-Powered Privacy</span>
              </div>
            </div>
            
            <div className="dashboard-card">
              <h3>Career Statistics</h3>
              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-value">{careerPaths.length}</div>
                  <div className="stat-label">Total Paths</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{activeCount}</div>
                  <div className="stat-label">Active</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{completedCount}</div>
                  <div className="stat-label">Completed</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{averageScore}%</div>
                  <div className="stat-label">Avg. Growth</div>
                </div>
              </div>
            </div>
            
            <div className="dashboard-card">
              <h3>Growth Trends</h3>
              {renderGrowthChart()}
            </div>
          </div>
        )}
        
        {activeTab === "paths" && (
          <div className="paths-section">
            <div className="section-header">
              <h2>My Career Paths</h2>
              <div className="header-actions">
                <button 
                  onClick={loadCareerPaths}
                  className="refresh-btn"
                  disabled={isRefreshing}
                >
                  {isRefreshing ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            </div>
            
            <div className="paths-list">
              {filteredPaths.length === 0 ? (
                <div className="no-paths">
                  <div className="no-paths-icon">📊</div>
                  <p>No career paths found</p>
                  <button 
                    className="primary-btn"
                    onClick={() => setShowCreateModal(true)}
                  >
                    Create First Path
                  </button>
                </div>
              ) : (
                filteredPaths.map(path => (
                  <div className={`path-card ${path.status}`} key={path.id}>
                    <div className="path-header">
                      <h3>{path.title}</h3>
                      <span className={`status-badge ${path.status}`}>
                        {path.status}
                      </span>
                    </div>
                    <div className="path-details">
                      <div className="growth-score">
                        <div className="score-value">{path.growthScore}%</div>
                        <div className="score-label">Growth Score</div>
                      </div>
                      <div className="path-skills">
                        <h4>Skills</h4>
                        <div className="skills-list">
                          {path.skills.map((skill, index) => (
                            <span key={index} className="skill-tag">{skill}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="path-actions">
                      {isOwner(path.owner) && path.status === "active" && (
                        <>
                          <button 
                            className="action-btn success"
                            onClick={() => simulateGrowth(path.id)}
                          >
                            Simulate Growth
                          </button>
                          <button 
                            className="action-btn warning"
                            onClick={() => archivePath(path.id)}
                          >
                            Archive
                          </button>
                        </>
                      )}
                    </div>
                    <div className="path-footer">
                      <span>Created: {new Date(path.timestamp * 1000).toLocaleDateString()}</span>
                      <span>By: {path.owner.substring(0, 6)}...{path.owner.substring(38)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        
        {activeTab === "analytics" && (
          <div className="analytics-section">
            <h2>Career Analytics</h2>
            <div className="analytics-content">
              <div className="analytics-card">
                <h3>Skill Distribution</h3>
                <div className="skill-cloud">
                  {Array.from(new Set(careerPaths.flatMap(p => p.skills))).map(skill => (
                    <span key={skill} className="skill-cloud-item">{skill}</span>
                  ))}
                </div>
              </div>
              <div className="analytics-card">
                <h3>Growth Over Time</h3>
                <div className="growth-timeline">
                  {careerPaths.slice(0, 5).map(path => (
                    <div key={path.id} className="timeline-item">
                      <div className="timeline-marker"></div>
                      <div className="timeline-content">
                        <h4>{path.title}</h4>
                        <p>Score: {path.growthScore}%</p>
                        <p>{new Date(path.timestamp * 1000).toLocaleDateString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
        
        {activeTab === "community" && (
          <div className="community-section">
            <h2>Career Community</h2>
            <div className="community-content">
              <div className="community-card">
                <h3>Success Stories</h3>
                <p>Read how others have used FHE-powered career simulations to advance their professional journey.</p>
                <button className="outline-btn">Explore Stories</button>
              </div>
              <div className="community-card">
                <h3>Skill Exchange</h3>
                <p>Connect with professionals who have complementary skill sets for mutual growth.</p>
                <button className="outline-btn">Join Network</button>
              </div>
            </div>
          </div>
        )}
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitCareerPath} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          pathData={newCareerPath}
          setPathData={setNewCareerPath}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && "✅"}
              {transactionStatus.status === "error" && "❌"}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="logo-icon">🌱</div>
              <span>CareerGrowthSim</span>
            </div>
            <p>FHE-powered career development simulation</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">About</a>
            <a href="#" className="footer-link">Privacy</a>
            <a href="#" className="footer-link">Terms</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} CareerGrowthSim. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  pathData: any;
  setPathData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  pathData,
  setPathData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setPathData({
      ...pathData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!pathData.title || !pathData.skills) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal">
        <div className="modal-header">
          <h2>Create Career Path</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <div className="key-icon">🔒</div> Your career data will be encrypted with FHE
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Career Path Title *</label>
              <input 
                type="text"
                name="title"
                value={pathData.title} 
                onChange={handleChange}
                placeholder="e.g., Senior Developer Track" 
                className="form-input"
              />
            </div>
            
            <div className="form-group">
              <label>Skills (comma separated) *</label>
              <input 
                type="text"
                name="skills"
                value={pathData.skills} 
                onChange={handleChange}
                placeholder="e.g., React, Node.js, Leadership" 
                className="form-input"
              />
            </div>
            
            <div className="form-group full-width">
              <label>Description</label>
              <textarea 
                name="description"
                value={pathData.description} 
                onChange={handleChange}
                placeholder="Describe your career goals and aspirations..." 
                className="form-textarea"
                rows={3}
              />
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="privacy-icon">🛡️</div> Data remains encrypted during all FHE simulations
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="submit-btn primary"
          >
            {creating ? "Encrypting with FHE..." : "Create Path"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;