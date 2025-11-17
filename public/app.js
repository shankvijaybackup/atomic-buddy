const { useState, useEffect } = React;

const AtomicworkOutreachApp = () => {
    const [activeTab, setActiveTab] = useState('setup');
    const [userProfile, setUserProfile] = useState('');
    const [companyProfile, setCompanyProfile] = useState('');
    const [leadProfile, setLeadProfile] = useState('');
    const [notebookId, setNotebookId] = useState('');
    const [analysis, setAnalysis] = useState(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [error, setError] = useState(null);

    const handleAnalyze = async () => {
        if (!userProfile || !companyProfile || !leadProfile) {
            alert('Please provide your profile, the company profile, and the lead\'s profile.');
            return;
        }

        setIsAnalyzing(true);
        setAnalysis(null);
        setError(null);
        
        try {
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    userProfile,
                    targetProfile: leadProfile,
                    knowledgeBase: companyProfile
                  })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || errorData.error || 'Analysis failed');
            }

            const result = await response.json();
            
            // Debug: Log the full result
            console.log('Full API response:', result);
            console.log('Lead persona data:', result.leadPersona);
            
            if (!result || !result.outreach) {
                throw new Error("Received an incomplete analysis from the server.");
            }

            setAnalysis(result);
            setActiveTab('results');
            
        } catch (err) {
            console.error('Analysis failed:', err);
            setError(err.message);
            alert(`Analysis failed: ${err.message}`);
        } finally {
            setIsAnalyzing(false);
        }
    };
    
    const copyToClipboard = async (text, type) => {
        try {
            await navigator.clipboard.writeText(text);
            alert(`${type} copied to clipboard!`);
        } catch (err)
        {
            console.error('Failed to copy: ', err);
            alert('Failed to copy to clipboard');
        }
    };

    const renderPersonalityScores = (oceanProfile) => {
        if (!oceanProfile) return null;
        return (
            <div className="grid grid-cols-5 gap-2 text-center text-xs mt-2">
                {Object.entries(oceanProfile).map(([trait, {score}]) => (
                    <div key={trait}>
                        <div className={`w-full bg-gray-200 rounded-full h-1.5`}>
                            <div className="bg-blue-600 h-1.5 rounded-full" style={{width: `${score * 10}%`}}></div>
                        </div>
                        <p className="mt-1 capitalize">{trait.substring(0,1)}</p>
                    </div>
                ))}
            </div>
        )
    };

    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="bg-white rounded-xl shadow-md p-6 mb-6">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
                            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M15 21v-1a6 6 0 00-5.197-5.986m0 0A5 5 0 019 9.5a5 5 0 015 5.232m0 0A5 5 0 0115 9.5a5 5 0 015 5.232m0 0A5 5 0 0119 15a5 5 0 01-2.232 4.014"></path></svg>
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-800">Hyper-Contextual Outreach Engine</h1>
                            <p className="text-gray-500">AI-Powered Personality & Context Analysis</p>
                        </div>
                    </div>
                    
                    <div className="flex gap-2 border-b">
                        {[
                            { id: 'setup', label: 'Setup & Analysis' },
                            { id: 'results', label: 'Outreach Results' }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors text-sm font-medium ${
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
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Your Profile */}
                            <div className="bg-white rounded-xl shadow-md p-6">
                                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2 text-gray-700">
                                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                                    Your Profile
                                </h2>
                                <textarea
                                    value={userProfile}
                                    onChange={(e) => setUserProfile(e.target.value)}
                                    placeholder="Paste your complete LinkedIn profile here..."
                                    className="w-full h-48 p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                />
                            </div>
                            {/* Company Profile */}
                            <div className="bg-white rounded-xl shadow-md p-6">
                                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2 text-gray-700">
                                    <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                                    Company Profile
                                </h2>
                                <textarea
                                    value={companyProfile}
                                    onChange={(e) => setCompanyProfile(e.target.value)}
                                    placeholder="Paste the company's complete LinkedIn profile here..."
                                    className="w-full h-48 p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                                />
                            </div>
                             {/* Lead Profile */}
                            <div className="bg-white rounded-xl shadow-md p-6">
                                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2 text-gray-700">
                                     <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                                    Lead's Profile
                                </h2>
                                <textarea
                                    value={leadProfile}
                                    onChange={(e) => setLeadProfile(e.target.value)}
                                    placeholder="Paste the lead's complete LinkedIn profile here..."
                                    className="w-full h-48 p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
                                />
                            </div>
                        </div>

                        {/* NotebookLM Input */}
                        <div className="bg-white rounded-xl shadow-md p-6">
                            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2 text-gray-700">
                                <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
                                NotebookLM Knowledge Base (Optional)
                            </h2>
                            <input
                                type="text"
                                value={notebookId}
                                onChange={(e) => setNotebookId(e.target.value)}
                                placeholder="Enter your NotebookLM ID here..."
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-sm"
                            />
                        </div>

                        <div className="text-center mt-6">
                            <button
                                onClick={handleAnalyze}
                                disabled={isAnalyzing || !userProfile || !companyProfile || !leadProfile}
                                className={`px-8 py-3 rounded-lg font-semibold text-white transition-all duration-300 ${
                                    isAnalyzing || !userProfile || !companyProfile || !leadProfile
                                        ? 'bg-gray-400 cursor-not-allowed'
                                        : 'bg-blue-600 hover:bg-blue-700 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5'
                                }`}
                            >
                                {isAnalyzing ? 
                                    <span className="flex items-center gap-2">
                                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Analyzing...
                                    </span>
                                : 'Generate Hyper-Contextualized Outreach'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Results Tab */}
                {activeTab === 'results' && (
                    <div className="space-y-6">
                        {analysis ? (
                            <div className="space-y-6">
                                {/* Personality Analysis */}
                                <div className="bg-white rounded-xl shadow-md p-6">
                                    {/* ================================================================= */}
                                    {/* THE FIX: The "Your Persona" card is removed, and the grid is gone. */}
                                    {/* The OCEAN scores are added to the Lead's card.                */}
                                    {/* ================================================================= */}
                                    <h2 className="text-lg font-semibold mb-3 flex items-center gap-2 text-gray-700">Lead's Personality Assessment</h2>
                                    <div className="space-y-3 text-sm">
                                        <p><span className="font-semibold">DISC:</span> {analysis.leadPersona?.discProfile?.primary || 'N/A'}</p>
                                        <p><span className="font-semibold">Communication:</span> {analysis.leadPersona?.discProfile?.communication || 'N/A'}</p>
                                        {/* This now correctly renders the OCEAN scores for the lead */}
                                        {renderPersonalityScores(analysis.leadPersona?.oceanProfile)}
                                    </div>
                                </div>

                                {/* Outreach Content */}
                                <div className="space-y-6">
                                    <div className="bg-white rounded-xl shadow-md p-6">
                                        <div className="mb-4">
                                            <h2 className="text-xl font-semibold flex items-center gap-2 text-gray-800">
                                                Professional Outreach Copy
                                            </h2>
                                            <p className="text-sm text-gray-600">Concise, contextual messages (300-400 characters each)</p>
                                        </div>
                                        
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            {/* LinkedIn */}
                                            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                                                <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                                                    <svg className="w-5 h-5 text-blue-700" fill="currentColor" viewBox="0 0 24 24">
                                                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                                                    </svg>
                                                    LinkedIn Message
                                                </h3>
                                                <div className="space-y-3 text-sm">
                                                    <div>
                                                        <div className="flex items-center justify-between mb-1">
                                                            <span className="font-semibold text-gray-600">Subject:</span>
                                                            <button onClick={() => copyToClipboard(analysis.outreach?.linkedin?.subject || '', 'LinkedIn Subject')} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                                                                </svg>
                                                                Copy
                                                            </button>
                                                        </div>
                                                        <p className="p-2 bg-white rounded border border-gray-200">{analysis.outreach?.linkedin?.subject || 'Not available'}</p>
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center justify-between mb-1">
                                                            <span className="font-semibold text-gray-600">Message:</span>
                                                            <button onClick={() => copyToClipboard(analysis.outreach?.linkedin?.message || '', 'LinkedIn Message')} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                                                                </svg>
                                                                Copy
                                                            </button>
                                                        </div>
                                                        <p className="p-2 bg-white rounded border border-gray-200 whitespace-pre-line">{analysis.outreach?.linkedin?.message || 'Not available'}</p>
                                                        <p className="text-xs text-gray-500 mt-1">Characters: {(analysis.outreach?.linkedin?.message || '').length}</p>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Email */}
                                            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                                                <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                                                    <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
                                                    </svg>
                                                    Email Message
                                                </h3>
                                                <div className="space-y-3 text-sm">
                                                    <div>
                                                        <div className="flex items-center justify-between mb-1">
                                                            <span className="font-semibold text-gray-600">Subject:</span>
                                                            <button onClick={() => copyToClipboard(analysis.outreach?.email?.subject || '', 'Email Subject')} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                                                                </svg>
                                                                Copy
                                                            </button>
                                                        </div>
                                                        <p className="p-2 bg-white rounded border border-gray-200">{analysis.outreach?.email?.subject || 'Not available'}</p>
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center justify-between mb-1">
                                                            <span className="font-semibold text-gray-600">Message:</span>
                                                            <button onClick={() => copyToClipboard(analysis.outreach?.email?.message || '', 'Email Message')} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                                                                </svg>
                                                                Copy
                                                            </button>
                                                        </div>
                                                        <p className="p-2 bg-white rounded border border-gray-200 whitespace-pre-line max-h-48 overflow-y-auto">{analysis.outreach?.email?.message || 'Not available'}</p>
                                                        <p className="text-xs text-gray-500 mt-1">Characters: {(analysis.outreach?.email?.message || '').length}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    </div>
                            </div>
                        ) : (
                            <div className="bg-white rounded-xl shadow-md p-6 text-center">
                                <h2 className="text-xl font-semibold mb-4 text-gray-700">Awaiting Analysis</h2>
                                <p className="text-gray-500">Please provide the required profiles and run the analysis to generate outreach content.</p>
                                {error && <p className="text-red-500 text-sm mt-4">Error: {error}</p>}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

ReactDOM.render(<AtomicworkOutreachApp />, document.getElementById('root'));