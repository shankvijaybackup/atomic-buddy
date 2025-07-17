const { useState, useEffect } = React;

const AtomicworkOutreachApp = () => {
    const [activeTab, setActiveTab] = useState('setup');
    const [userProfile, setUserProfile] = useState('');
    const [targetProfile, setTargetProfile] = useState('');
    const [documents, setDocuments] = useState([]);
    const [analysis, setAnalysis] = useState(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [userProfileSaved, setUserProfileSaved] = useState(false);

    // Load saved profile on startup
    useEffect(() => {
        const savedProfile = localStorage.getItem('atomicwork_user_profile');
        if (savedProfile) {
            setUserProfile(savedProfile);
            setUserProfileSaved(true);
        }
        loadFiles();
    }, []);

    const loadFiles = async () => {
        try {
            const response = await fetch('/api/files');
            const data = await response.json();
            setDocuments(data.files || []);
        } catch (error) {
            console.error('Error loading files:', error);
        }
    };

    const saveUserProfile = () => {
        if (userProfile.trim()) {
            localStorage.setItem('atomicwork_user_profile', userProfile);
            setUserProfileSaved(true);
        }
    };

    const clearUserProfile = () => {
        localStorage.removeItem('atomicwork_user_profile');
        setUserProfile('');
        setUserProfileSaved(false);
    };
const handleDocumentUpload = async (event) => {
        const files = Array.from(event.target.files);
        
        try {
            const formData = new FormData();
            files.forEach(file => {
                formData.append('files', file);
            });

            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error('Upload failed');
            }

            const result = await response.json();
            setDocuments(prev => [...prev, ...result.files]);
            alert('Files uploaded successfully!');
        } catch (error) {
            console.error('Upload error:', error);
            alert('Upload failed. Please try again.');
        }
    };
    const handleAnalyze = async () => {
        if (!userProfile || !targetProfile) {
            alert('Please provide both your profile and target prospect profile');
            return;
        }

        setIsAnalyzing(true);
        
        try {
            console.log('Starting analysis...');
            
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    userProfile,
                    targetProfile,
                    knowledgeBase: documents
                })
            });

            if (!response.ok) {
                throw new Error('Analysis failed');
            }

            const result = await response.json();
            setAnalysis(result);
            setActiveTab('results');
            alert('Analysis completed! Check the Results tab.');
        } catch (error) {
            console.error('Analysis failed:', error);
            alert('Analysis failed. Please try again.');
        } finally {
            setIsAnalyzing(false);
        }
    };
    const copyToClipboard = async (text, type) => {
        try {
            await navigator.clipboard.writeText(text);
            alert(`${type} copied to clipboard!`);
        } catch (err) {
            console.error('Failed to copy: ', err);
            alert('Failed to copy to clipboard');
        }
    };
    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-12 h-12 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-800">Atomicwork Outreach Assistant</h1>
                            <p className="text-gray-600">Multi-AI powered ITSM outreach</p>
                        </div>
                    </div>
                    
                    <div className="flex gap-2 border-b">
                        {[
                            { id: 'setup', label: 'Setup & Analysis' },
                            { id: 'knowledge', label: 'Knowledge Base' },
                            { id: 'results', label: 'Outreach Results' }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors ${
                                    activeTab === tab.id 
                                        ? 'bg-blue-600 text-white' 
                                        : 'text-gray-600 hover:bg-gray-100'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Setup Tab */}
                {activeTab === 'setup' && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="bg-white rounded-xl shadow-lg p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-xl font-semibold flex items-center gap-2">
                                        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                        </svg>
                                        Your Profile (Ex-Freshworks Founder)
                                    </h2>
                                    {userProfileSaved ? (
                                        <div className="flex items-center gap-2">
                                            <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                            </svg>
                                            <span className="text-sm text-green-600">Saved</span>
                                            <button
                                                onClick={clearUserProfile}
                                                className="text-xs text-red-600 hover:text-red-700 underline"
                                            >
                                                Clear
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={saveUserProfile}
                                            disabled={!userProfile.trim()}
                                            className={`flex items-center gap-1 px-3 py-1 rounded text-sm ${
                                                userProfile.trim()
                                                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                                                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                            }`}
                                        >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                                            </svg>
                                            Save
                                        </button>
                                    )}
                                </div>
                                
                                <textarea
                                    value={userProfile}
                                    onChange={(e) => setUserProfile(e.target.value)}
                                    placeholder="Paste your complete LinkedIn profile here..."
                                    className="w-full h-48 p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    disabled={userProfileSaved}
                                />
                            </div>

                            <div className="bg-white rounded-xl shadow-lg p-6">
                                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Target Prospect Profile
                                </h2>
                                <textarea
                                    value={targetProfile}
                                    onChange={(e) => setTargetProfile(e.target.value)}
                                    placeholder="Paste the target prospect's complete LinkedIn profile here..."
                                    className="w-full h-48 p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                />
                            </div>
                        </div>

                        <div className="text-center">
                            <button
                                onClick={handleAnalyze}
                                disabled={isAnalyzing || !userProfile || !targetProfile}
                                className={`px-8 py-3 rounded-lg font-medium transition-colors ${
                                    isAnalyzing || !userProfile || !targetProfile
                                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                        : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700'
                                }`}
                            >
                                {isAnalyzing ? 'Generating Multi-AI Outreach...' : 'Generate Multi-AI Outreach'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Knowledge Base Tab */}
                {activeTab === 'knowledge' && (
                    <div className="bg-white rounded-xl shadow-lg p-6">
                        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                            <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Atomicwork Knowledge Base
                        </h2>
                        
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center mb-6">
                            <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                            <p className="text-gray-600 mb-4">Upload Atomicwork documents, videos, demos, presentations</p>
                            <input
                                type="file"
                                multiple
                                onChange={handleDocumentUpload}
                                className="hidden"
                                id="file-upload"
                                accept=".pdf,.doc,.docx,.ppt,.pptx,.mp4,.mov,.avi,.jpg,.png,.jpeg"
                            />
                            <label
                                htmlFor="file-upload"
                                className="bg-blue-600 text-white px-6 py-2 rounded-lg cursor-pointer hover:bg-blue-700 transition-colors"
                            >
                                {documents.length > 0 ? 'Add More Files' : 'Select Files'}
                            </label>
                        </div>

                        {documents.length > 0 && (
                            <div className="space-y-4">
                                <h3 className="font-medium text-gray-800">Knowledge Base ({documents.length} files)</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {documents.map((doc, index) => (
                                        <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                                            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-sm truncate">{doc.name}</p>
                                                <p className="text-xs text-gray-500">
                                                    {(doc.size / 1024 / 1024).toFixed(1)} MB
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Results Tab */}
                {activeTab === 'results' && (
                    <div className="space-y-6">
                        {analysis ? (
                            <>
                                {/* Persona & DISC Analysis */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="bg-white rounded-xl shadow-lg p-6">
                                        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                                            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                            </svg>
                                            Prospect Analysis
                                        </h2>
                                        <div className="space-y-3">
                                            <div>
                                                <span className="font-medium text-gray-700">Name:</span>
                                                <p className="text-gray-600">{analysis.persona.name}</p>
                                            </div>
                                            <div>
                                                <span className="font-medium text-gray-700">Job Title:</span>
                                                <p className="text-gray-600">{analysis.persona.jobTitle}</p>
                                            </div>
                                            <div>
                                                <span className="font-medium text-gray-700">Company:</span>
                                                <p className="text-gray-600">{analysis.persona.company}</p>
                                            </div>
                                            <div>
                                                <span className="font-medium text-gray-700">Industry:</span>
                                                <p className="text-gray-600">{analysis.persona.industry}</p>
                                            </div>
                                            <div>
                                                <span className="font-medium text-gray-700">Level:</span>
                                                <p className="text-gray-600">{analysis.persona.level}</p>
                                            </div>
                                            <div>
                                                <span className="font-medium text-gray-700">Key Pain Points:</span>
                                                <ul className="text-gray-600 text-sm mt-1">
                                                    {analysis.persona.painPoints.map((point, i) => (
                                                        <li key={i}>• {point}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-white rounded-xl shadow-lg p-6">
                                        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                                            <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            Communication Style
                                        </h2>
                                        <div className="space-y-3">
                                            <div>
                                                <span className="font-medium text-gray-700">DISC Profile:</span>
                                                <p className="text-gray-600">{analysis.discProfile.primary}</p>
                                            </div>
                                            <div>
                                                <span className="font-medium text-gray-700">Key Traits:</span>
                                                <ul className="text-gray-600 text-sm mt-1">
                                                    {analysis.discProfile.traits.map((trait, i) => (
                                                        <li key={i}>• {trait}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                            <div>
                                                <span className="font-medium text-gray-700">Communication Preference:</span>
                                                <p className="text-gray-600 text-sm">{analysis.discProfile.communication}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* User Info */}
                                {analysis.userName && (
                                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                        <p className="text-sm text-blue-800">
                                            <strong>Personalized for:</strong> {analysis.userName} (Ex-Freshworks Founder, ITIL Expert)
                                        </p>
                                    </div>
                                )}

                                {/* Outreach Content */}
                                <div className="space-y-6">
                                    {[
                                        { key: 'direct', title: 'Option 1: Direct & Technical', color: 'blue', description: 'OpenAI - Technical insights with social proof' },
                                        { key: 'formal', title: 'Option 2: Formal & Enterprise', color: 'purple', description: 'Claude - Strategic approach with customer stories' },
                                        { key: 'personalized', title: 'Option 3: Personalized & Relationship', color: 'green', description: 'Gemini - Industry-specific with case studies' }
                                    ].map((option) => (
                                        <div key={option.key} className="bg-white rounded-xl shadow-lg p-6">
                                            <div className="flex items-center justify-between mb-4">
                                                <h2 className={`text-xl font-semibold flex items-center gap-2 text-${option.color}-700`}>
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                                    </svg>
                                                    {option.title}
                                                </h2>
                                                <span className="text-sm text-gray-600">{option.description}</span>
                                            </div>
                                            
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div className={`border border-${option.color}-200 rounded-lg p-4`}>
                                                    <h3 className={`font-medium text-${option.color}-700 mb-3 flex items-center gap-2`}>
                                                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                                            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                                                        </svg>
                                                        LinkedIn Sales Navigator
                                                    </h3>
                                                    <div className="space-y-3">
                                                        <div>
                                                            <div className="flex items-center justify-between mb-1">
                                                                <span className="text-sm font-medium text-gray-700">Subject:</span>
                                                                <button
                                                                    onClick={() => copyToClipboard(analysis.outreach[option.key].linkedin.subject, 'LinkedIn Subject')}
                                                                    className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                                                >
                                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                                    </svg>
                                                                    Copy
                                                                </button>
                                                            </div>
                                                            <div className={`p-2 bg-${option.color}-50 rounded border`}>
                                                                <p className="text-sm">{analysis.outreach[option.key].linkedin.subject}</p>
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center justify-between mb-1">
                                                                <span className="text-sm font-medium text-gray-700">Message:</span>
                                                                <button
                                                                    onClick={() => copyToClipboard(analysis.outreach[option.key].linkedin.message, 'LinkedIn Message')}
                                                                    className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                                                >
                                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                                    </svg>
                                                                    Copy
                                                                </button>
                                                            </div>
                                                            <div className={`p-2 bg-${option.color}-50 rounded border`}>
                                                                <p className="text-sm">{analysis.outreach[option.key].linkedin.message}</p>
                                                            </div>
                                                        </div>
                                                        <div className="text-xs text-gray-500">
                                                            Character count: {analysis.outreach[option.key].linkedin.message.length}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className={`border border-${option.color}-200 rounded-lg p-4`}>
                                                    <h3 className={`font-medium text-${option.color}-700 mb-3 flex items-center gap-2`}>
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                                        </svg>
                                                        Email Outreach
                                                    </h3>
                                                    <div className="space-y-3">
                                                        <div>
                                                            <div className="flex items-center justify-between mb-1">
                                                                <span className="text-sm font-medium text-gray-700">Subject:</span>
                                                                <button
                                                                    onClick={() => copyToClipboard(analysis.outreach[option.key].email.subject, 'Email Subject')}
                                                                    className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                                                >
                                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                                    </svg>
                                                                    Copy
                                                                </button>
                                                            </div>
                                                            <div className={`p-2 bg-${option.color}-50 rounded border`}>
                                                                <p className="text-sm">{analysis.outreach[option.key].email.subject}</p>
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center justify-between mb-1">
                                                                <span className="text-sm font-medium text-gray-700">Message:</span>
                                                                <button
                                                                    onClick={() => copyToClipboard(analysis.outreach[option.key].email.message, 'Email Message')}
                                                                    className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                                                >
                                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                                    </svg>
                                                                    Copy
                                                                </button>
                                                            </div>
                                                            <div className={`p-2 bg-${option.color}-50 rounded border max-h-48 overflow-y-auto`}>
                                                                <p className="text-sm whitespace-pre-line">{analysis.outreach[option.key].email.message}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div className="bg-white rounded-xl shadow-lg p-6">
                                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                    </svg>
                                    Multi-AI Outreach Results
                                </h2>
                                <p className="text-gray-600">Please run the analysis first to see results here.</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

ReactDOM.render(<AtomicworkOutreachApp />, document.getElementById('root'));