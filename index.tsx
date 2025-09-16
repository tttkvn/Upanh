import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';

const GITHUB_API_BASE = 'https://api.github.com/repos';
const IMAGES_PER_PAGE = 15;

// --- Utility Functions ---
const sanitizeFolderName = (name: string): string => {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9-]/g, '');
};

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = error => reject(error);
  });
};

// --- GitHub API Helper ---
const githubApi = {
  async request(path: string, token: string, options: RequestInit = {}) {
    const response = await fetch(`${GITHUB_API_BASE}${path}`, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`GitHub API Error: ${errorData.message}`);
    }
    if (response.status === 204 || response.headers.get('Content-Length') === '0') {
      return null;
    }
    return response.json();
  },
};

// --- React Components ---

const Notification = ({ message, type, onEnd }: { message: string | null; type: 'success' | 'error'; onEnd: () => void }) => {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (message) {
            setVisible(true);
            const timer = setTimeout(() => {
                setVisible(false);
                setTimeout(onEnd, 300);
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [message, onEnd]);

    return (
        <div className={`notification ${type} ${visible ? 'show' : ''}`}>
            {message}
        </div>
    );
};

const Login = ({ onLogin, loginError, isLoading }: { onLogin: (token: string, repo: string) => void; loginError: string | null; isLoading: boolean; }) => {
    const [token, setToken] = useState('');
    const [repo, setRepo] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onLogin(token, repo);
    };

    return (
        <div className="login-container">
            <form onSubmit={handleSubmit} className="login-form">
                <h2>Đăng nhập GitHub</h2>
                <input
                    type="password"
                    value={token}
                    onChange={e => setToken(e.target.value)}
                    placeholder="GitHub Personal Access Token"
                    aria-label="GitHub Personal Access Token"
                    required
                    disabled={isLoading}
                />
                <input
                    type="text"
                    value={repo}
                    onChange={e => setRepo(e.target.value)}
                    placeholder="Repo (ví dụ: user/repo-name)"
                    aria-label="GitHub Repository"
                    pattern="^[^/]+/[^/]+$"
                    title="Định dạng phải là 'user/repo-name'"
                    required
                    disabled={isLoading}
                />
                <button type="submit" disabled={isLoading}>
                    {isLoading ? 'Đang kiểm tra...' : 'Đăng nhập'}
                </button>
                {loginError && <p className="error-message">{loginError}</p>}
            </form>
        </div>
    );
};


const Uploader = ({ activeFolder, onImageUpload }: { activeFolder: string; onImageUpload: (files: FileList) => void }) => {
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(e.type === 'dragenter' || e.type === 'dragover');
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            onImageUpload(e.dataTransfer.files);
        }
    };
    
    const handleClick = () => fileInputRef.current?.click();
    
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            onImageUpload(e.target.files);
        }
    };

    return (
        <>
            <h3>Tải lên "{activeFolder}"</h3>
            <div
                className={`uploader-zone ${isDragging ? 'drag-over' : ''}`}
                onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop} onClick={handleClick}
            >
                <input type="file" ref={fileInputRef} onChange={handleFileChange} multiple accept="image/*" style={{display: 'none'}} />
                <p>Kéo và thả ảnh vào đây, hoặc nhấp để chọn tệp</p>
            </div>
        </>
    );
}

const ImageViewerModal = ({ images, currentIndex, onClose, onNext, onPrev, onCopyLink }: {
    images: any[];
    currentIndex: number;
    onClose: () => void;
    onNext: () => void;
    onPrev: () => void;
    onCopyLink: (url: string) => void;
}) => {
    const image = images[currentIndex];

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowRight') onNext();
            if (e.key === 'ArrowLeft') onPrev();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose, onNext, onPrev]);

    if (!image) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <button className="modal-close-button" onClick={onClose} aria-label="Đóng">×</button>
                <img src={image.download_url} alt={image.name} className="modal-image" />
                <div className="modal-info">
                    <p title={image.name}>{image.name}</p>
                    <button onClick={() => onCopyLink(image.download_url)}>Sao chép URL</button>
                </div>
                <button className="modal-nav-button prev" onClick={onPrev} disabled={currentIndex === 0} aria-label="Ảnh trước">‹</button>
                <button className="modal-nav-button next" onClick={onNext} disabled={currentIndex === images.length - 1} aria-label="Ảnh kế tiếp">›</button>
            </div>
        </div>
    );
};

const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, children }: {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    children: React.ReactNode;
}) => {
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="confirmation-modal-content" onClick={(e) => e.stopPropagation()}>
                <h3>{title}</h3>
                <div className="confirmation-modal-body">
                    {children}
                </div>
                <div className="confirmation-modal-buttons">
                    <button onClick={onClose} className="button-secondary">Hủy</button>
                    <button onClick={onConfirm} className="button-danger">Xóa</button>
                </div>
            </div>
        </div>
    );
};

const App = () => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [loginError, setLoginError] = useState<string | null>(null);
    const [config, setConfig] = useState<{ token: string; repo: string } | null>(null);

    const [folders, setFolders] = useState<string[]>([]);
    const [images, setImages] = useState<any[]>([]);
    const [activeFolder, setActiveFolder] = useState<string | null>(null);
    
    const [isLoading, setIsLoading] = useState(true);
    const [isUploading, setIsUploading] = useState(false);
    
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const [currentPage, setCurrentPage] = useState(1);
    const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
    const [newFolderName, setNewFolderName] = useState('');
    const [sortOrder, setSortOrder] = useState('date-desc');
    const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
    const [imageToDelete, setImageToDelete] = useState<any | null>(null);
    const [folderToDelete, setFolderToDelete] = useState<string | null>(null);
    const renameInputRef = useRef<HTMLInputElement>(null);
    
    // Check local storage for credentials on initial load
    useEffect(() => {
        const storedToken = localStorage.getItem('github_token');
        const storedRepo = localStorage.getItem('github_repo');

        const validateAndSetConfig = async (token: string, repo: string) => {
            try {
                // Test request to validate credentials
                await githubApi.request(`/${repo}`, token);
                setConfig({ token, repo });
                setIsAuthenticated(true);
            } catch (error) {
                // Credentials might be invalid, clear them
                localStorage.removeItem('github_token');
                localStorage.removeItem('github_repo');
                setLoginError('Token hoặc repo đã lưu không hợp lệ. Vui lòng đăng nhập lại.');
            } finally {
                setIsLoading(false);
            }
        };

        if (storedToken && storedRepo) {
            validateAndSetConfig(storedToken, storedRepo);
        } else {
            setIsLoading(false); // No credentials, just show login
        }
    }, []);

    useEffect(() => {
        renameInputRef.current?.focus();
    }, [renamingFolder]);

    const showNotification = (message: string, type: 'success' | 'error') => {
        setNotification({ message, type });
    };

    const handleLogin = async (token: string, repo: string) => {
        setIsLoading(true);
        setLoginError(null);
        try {
            await githubApi.request(`/${repo}`, token); // Test request
            localStorage.setItem('github_token', token);
            localStorage.setItem('github_repo', repo);
            setConfig({ token, repo });
            setIsAuthenticated(true);
        } catch (error) {
            setLoginError(`Đăng nhập thất bại: Token hoặc repo không đúng.`);
            setIsAuthenticated(false);
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleLogout = () => {
        localStorage.removeItem('github_token');
        localStorage.removeItem('github_repo');
        setConfig(null);
        setIsAuthenticated(false);
        setFolders([]);
        setImages([]);
        setActiveFolder(null);
        setLoginError(null);
    };
    
    const loadFolders = useCallback(async () => {
        if (!config) return;
        setIsLoading(true);
        try {
            const contents = await githubApi.request(`/${config.repo}/contents/`, config.token);
            const folderData = contents.filter((item: any) => item.type === 'dir').map((item: any) => item.name);
            setFolders(folderData);
            if (folderData.length > 0 && !activeFolder) {
                setActiveFolder(folderData[0]);
            }
        } catch (error) {
            showNotification(`Lỗi tải thư mục: ${(error as Error).message}`, 'error');
        } finally {
            setIsLoading(false);
        }
    }, [config, activeFolder]);
    
    useEffect(() => {
        if (config) {
            loadFolders();
        }
    }, [config, loadFolders]);

    const loadImagesForFolder = useCallback(async (folderName: string) => {
        if (!config) return;
        setIsLoading(true);
        setCurrentPage(1);
        setImages([]);
        try {
            const contents = await githubApi.request(`/${config.repo}/contents/${folderName}`, config.token);
            const imageData = contents.filter((item: any) => item.type === 'file' && /\.(jpg|jpeg|png|gif|webp)$/i.test(item.name));

            const imagesWithDates = await Promise.all(
                imageData.map(async (image: any) => {
                    try {
                        const commits = await githubApi.request(`/${config.repo}/commits?path=${image.path}&per_page=1`, config.token);
                        const commitDate = commits[0]?.commit?.author?.date;
                        return { ...image, commitDate: commitDate || new Date(0).toISOString() };
                    } catch (error) {
                        console.error(`Could not fetch commit for ${image.name}`, error);
                        return { ...image, commitDate: new Date(0).toISOString() };
                    }
                })
            );

            setImages(imagesWithDates);
        } catch (error) {
             setImages([]); // Folder might be empty or not found
        } finally {
            setIsLoading(false);
        }
    }, [config]);

    const sortedImages = useMemo(() => {
        const sortableImages = [...images];
        switch (sortOrder) {
            case 'name-asc':
                return sortableImages.sort((a, b) => a.name.localeCompare(b.name));
            case 'name-desc':
                return sortableImages.sort((a, b) => b.name.localeCompare(a.name));
            case 'date-asc':
                return sortableImages.sort((a, b) => new Date(a.commitDate).getTime() - new Date(b.commitDate).getTime());
            case 'date-desc':
            default:
                return sortableImages.sort((a, b) => new Date(b.commitDate).getTime() - new Date(a.commitDate).getTime());
        }
    }, [images, sortOrder]);

    const totalPages = Math.ceil(sortedImages.length / IMAGES_PER_PAGE);
    const paginatedImages = sortedImages.slice((currentPage - 1) * IMAGES_PER_PAGE, currentPage * IMAGES_PER_PAGE);

    useEffect(() => {
        if (activeFolder) {
            loadImagesForFolder(activeFolder);
        } else {
            setImages([]);
        }
    }, [activeFolder, loadImagesForFolder]);

    const handleAddFolder = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const form = e.currentTarget;
        const input = form.elements.namedItem('folderName') as HTMLInputElement;
        const folderName = input.value.trim();
        if (!config || !folderName) return;

        const sanitized = sanitizeFolderName(folderName);
        if (folders.includes(sanitized)) {
            showNotification(`Thư mục "${sanitized}" đã tồn tại.`, 'error');
            return;
        }

        try {
            await githubApi.request(`/${config.repo}/contents/${sanitized}/.gitkeep`, config.token, {
                method: 'PUT',
                body: JSON.stringify({
                    message: `feat: Create folder '${sanitized}'`,
                    content: ''
                }),
            });
            showNotification(`Thư mục "${sanitized}" đã được tạo.`, 'success');
            setFolders([...folders, sanitized]);
            setActiveFolder(sanitized);
            input.value = '';
        } catch (error) {
            showNotification(`Không thể tạo thư mục: ${(error as Error).message}`, 'error');
        }
    };
    
    const handleConfirmDeleteFolder = async () => {
        if (!config || !folderToDelete) return;

        const folderName = folderToDelete;
        setFolderToDelete(null);
        setIsLoading(true);

        try {
            const files = await githubApi.request(`/${config.repo}/contents/${folderName}`, config.token);
            for (const file of files) {
                await githubApi.request(`/${config.repo}/contents/${file.path}`, config.token, {
                    method: 'DELETE',
                    body: JSON.stringify({
                        message: `feat: Delete image ${file.name}`,
                        sha: file.sha,
                    }),
                });
            }
            showNotification(`Đã xóa thư mục: ${folderName}`, 'success');
            const updatedFolders = folders.filter(f => f !== folderName);
            setFolders(updatedFolders);
            if (activeFolder === folderName) {
                setActiveFolder(updatedFolders.length > 0 ? updatedFolders[0] : null);
            }
        } catch (error) {
            if ((error as Error).message.includes("Not Found")) {
                 const updatedFolders = folders.filter(f => f !== folderName);
                 setFolders(updatedFolders);
                 if (activeFolder === folderName) {
                    setActiveFolder(updatedFolders.length > 0 ? updatedFolders[0] : null);
                 }
                 showNotification(`Đã xóa thư mục rỗng: ${folderName}`, 'success');
            } else {
                showNotification(`Lỗi xóa thư mục ${folderName}: ${(error as Error).message}`, 'error');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleStartRename = (folderName: string) => {
        setActiveFolder(folderName);
        setRenamingFolder(folderName);
        setNewFolderName(folderName);
    };

    const handleFinishRename = async () => {
        if (!renamingFolder) return;

        const oldName = renamingFolder;
        const newSanitizedName = sanitizeFolderName(newFolderName.trim());
        
        setRenamingFolder(null);

        if (!newSanitizedName || oldName === newSanitizedName) {
            return;
        }

        if (folders.includes(newSanitizedName)) {
            showNotification(`Thư mục "${newSanitizedName}" đã tồn tại.`, 'error');
            return;
        }

        await renameFolderOnGitHub(oldName, newSanitizedName);
    };

    const handleRenameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            (e.target as HTMLInputElement).blur();
        } else if (e.key === 'Escape') {
            setRenamingFolder(null);
        }
    };
    
    const renameFolderOnGitHub = async (oldName: string, newName: string) => {
        if (!config) return;
        setIsLoading(true);
        try {
            const filesToMove = await githubApi.request(`/${config.repo}/contents/${oldName}`, config.token);

            if (!filesToMove || filesToMove.length === 0) {
                 await githubApi.request(`/${config.repo}/contents/${newName}/.gitkeep`, config.token, { method: 'PUT', body: JSON.stringify({ message: `feat: Create folder '${newName}'`, content: '' }) });
            } else {
                 for (const file of filesToMove) {
                    const fileData = await githubApi.request(file.url, config.token);
                    await githubApi.request(`/${config.repo}/contents/${newName}/${file.name}`, config.token, {
                        method: 'PUT',
                        body: JSON.stringify({ message: `refactor: Move ${file.name} to ${newName}`, content: fileData.content }),
                    });
                    await githubApi.request(`/${config.repo}/contents/${file.path}`, config.token, {
                        method: 'DELETE',
                        body: JSON.stringify({ message: `refactor: Delete ${file.name} from ${oldName}`, sha: file.sha }),
                    });
                }
            }

            showNotification(`Đã đổi tên thư mục thành "${newName}"`, 'success');
            setFolders(prev => prev.map(f => f === oldName ? newName : f).sort());
            setActiveFolder(newName);

        } catch (error) {
            showNotification(`Lỗi đổi tên thư mục: ${(error as Error).message}`, 'error');
            loadFolders(); // Reload folders to reflect actual state
        } finally {
            setIsLoading(false);
        }
    };

    const handleImageUpload = async (files: FileList) => {
        if (!config || !activeFolder) return;
        
        setIsUploading(true);
        let successfulUploads = 0;
        const fileArray = Array.from(files);
        
        const uploadPromises = fileArray.map(async (file) => {
             if (images.some(img => img.name === file.name)) {
                showNotification(`Lỗi: Ảnh "${file.name}" đã tồn tại trong thư mục này.`, 'error');
                return;
            }
            try {
                const content = await fileToBase64(file);
                const path = `${activeFolder}/${file.name}`;
                await githubApi.request(`/${config.repo}/contents/${path}`, config.token, {
                    method: 'PUT',
                    body: JSON.stringify({
                        message: `feat: Add image ${file.name}`,
                        content,
                    }),
                });
                successfulUploads++;
            } catch (error) {
                showNotification(`Lỗi tải lên ${file.name}: ${(error as Error).message}`, 'error');
            }
        });

        await Promise.all(uploadPromises);
        setIsUploading(false);

        if (successfulUploads > 0) {
            showNotification(`Đã tải lên thành công ${successfulUploads} ảnh.`, 'success');
            if(activeFolder) {
                loadImagesForFolder(activeFolder);
            }
        }
    };

    const handleDeleteImage = async () => {
        if (!config || !imageToDelete) return;
        const image = imageToDelete;
        setImageToDelete(null); 

        try {
            await githubApi.request(`/${config.repo}/contents/${image.path}`, config.token, {
                method: 'DELETE',
                body: JSON.stringify({
                    message: `feat: Delete image ${image.name}`,
                    sha: image.sha,
                }),
            });
            setImages(prev => prev.filter(img => img.sha !== image.sha));
            showNotification(`Đã xóa: ${image.name}`, 'success');
        } catch (error) {
            showNotification(`Lỗi xóa ${image.name}: ${(error as Error).message}`, 'error');
        }
    };

    const handleCopyLink = (url: string) => {
        navigator.clipboard.writeText(url);
        showNotification('Đã sao chép liên kết!', 'success');
    };

    const handleImageClick = (index: number) => {
        setSelectedImageIndex(index);
    };

    const handleCloseModal = () => {
        setSelectedImageIndex(null);
    };

    const handleNextImage = () => {
        if (selectedImageIndex !== null && selectedImageIndex < sortedImages.length - 1) {
            setSelectedImageIndex(selectedImageIndex + 1);
        }
    };

    const handlePrevImage = () => {
        if (selectedImageIndex !== null && selectedImageIndex > 0) {
            setSelectedImageIndex(selectedImageIndex - 1);
        }
    };

    if (isLoading && !isAuthenticated) {
        return <div className="loader" aria-label="Đang tải"></div>;
    }
    
    if (!isAuthenticated) {
        return <Login onLogin={handleLogin} loginError={loginError} isLoading={isLoading} />;
    }

    return (
        <>
            <header>
                <h1>Lưu Ảnh</h1>
                <button onClick={handleLogout} className="logout-button">Đăng xuất</button>
            </header>
            <main className="app-container">
                <aside className="sidebar">
                    <div className="sidebar-header">
                        <h2>Thư mục</h2>
                        <button onClick={loadFolders} className="refresh-button" aria-label="Làm mới danh sách thư mục">🔄</button>
                    </div>
                    <ul className="folder-list">
                        {folders.map(folder => (
                            <li key={folder} className={`folder-item ${folder === activeFolder ? 'active' : ''}`} onClick={() => renamingFolder !== folder && setActiveFolder(folder)}>
                                {renamingFolder === folder ? (
                                    <input
                                        ref={renameInputRef}
                                        type="text"
                                        value={newFolderName}
                                        onChange={(e) => setNewFolderName(e.target.value)}
                                        onBlur={handleFinishRename}
                                        onKeyDown={handleRenameKeyDown}
                                        className="rename-folder-input"
                                    />
                                ) : (
                                    <>
                                        <span className="folder-name" onDoubleClick={() => handleStartRename(folder)}>
                                            {folder}
                                        </span>
                                        <button className="delete-folder-button" onClick={(e) => { e.stopPropagation(); setFolderToDelete(folder); }} aria-label={`Xóa thư mục ${folder}`}>×</button>
                                    </>
                                )}
                            </li>
                        ))}
                    </ul>
                    <form onSubmit={handleAddFolder} className="add-folder-form">
                        <input name="folderName" type="text" placeholder="Tên thư mục mới..." className="add-folder-input" aria-label="Tên thư mục mới" required />
                        <button type="submit" className="add-folder-button" aria-label="Thêm thư mục">+</button>
                    </form>
                </aside>
                <section className="main-content">
                    {activeFolder ? (
                        <>
                            <Uploader activeFolder={activeFolder} onImageUpload={handleImageUpload} />
                             {isUploading && <div className="loader" aria-label="Đang tải lên"></div>}

                            <div className="gallery-controls">
                                <label htmlFor="sort-order">Sắp xếp theo: </label>
                                <select id="sort-order" value={sortOrder} onChange={e => setSortOrder(e.target.value)} className="sort-select">
                                    <option value="date-desc">Ngày tải lên (Mới nhất)</option>
                                    <option value="date-asc">Ngày tải lên (Cũ nhất)</option>
                                    <option value="name-asc">Tên (A-Z)</option>
                                    <option value="name-desc">Tên (Z-A)</option>
                                </select>
                            </div>
                            
                            <div className="gallery-container">
                                {isLoading && images.length === 0 && <div className="loader" aria-label="Đang tải ảnh"></div>}
                                {paginatedImages.map(image => {
                                    const fullIndex = sortedImages.findIndex(img => img.sha === image.sha);
                                    return (
                                        <div key={image.sha} className="gallery-item" onClick={() => handleImageClick(fullIndex)}>
                                            <button className="delete-button" aria-label="Xóa ảnh" onClick={(e) => { e.stopPropagation(); setImageToDelete(image); }}>🗑️</button>
                                            <img src={image.download_url} alt={image.name} className="gallery-image" />
                                            <div className="image-info">
                                                <p className="image-link" title={image.name}>
                                                    {image.name}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            {images.length === 0 && !isLoading && !isUploading && <p>Thư mục này trống. Hãy tải lên vài tấm ảnh!</p>}
                            {totalPages > 1 && (
                                <div className="pagination">
                                    <button onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1}>Trước</button>
                                    <span>Trang {currentPage} / {totalPages}</span>
                                    <button onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage === totalPages}>Sau</button>
                                </div>
                            )}
                        </>
                    ) : (
                         <div className="placeholder">
                           {isLoading && !folders.length ? <div className="loader"></div> : <p>Tạo hoặc chọn một thư mục để bắt đầu.</p>}
                        </div>
                    )}
                </section>
            </main>
            {selectedImageIndex !== null && (
                <ImageViewerModal
                    images={sortedImages}
                    currentIndex={selectedImageIndex}
                    onClose={handleCloseModal}
                    onNext={handleNextImage}
                    onPrev={handlePrevImage}
                    onCopyLink={handleCopyLink}
                />
            )}
            <ConfirmationModal
                isOpen={!!folderToDelete}
                onClose={() => setFolderToDelete(null)}
                onConfirm={handleConfirmDeleteFolder}
                title="Xác nhận Xóa Thư mục"
            >
                <p>Bạn có chắc chắn muốn xóa vĩnh viễn thư mục:</p>
                <p><strong>{folderToDelete}</strong></p>
                <p>Tất cả ảnh bên trong cũng sẽ bị xóa. Hành động này không thể hoàn tác.</p>
            </ConfirmationModal>
             <ConfirmationModal
                isOpen={!!imageToDelete}
                onClose={() => setImageToDelete(null)}
                onConfirm={handleDeleteImage}
                title="Xác nhận Xóa Ảnh"
            >
                <p>Bạn có chắc chắn muốn xóa vĩnh viễn ảnh:</p>
                <p><strong>{imageToDelete?.name}</strong></p>
            </ConfirmationModal>
            <Notification message={notification?.message ?? null} type={notification?.type ?? 'success'} onEnd={() => setNotification(null)} />
        </>
    );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);