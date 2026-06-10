$path = "D:\React project\client"
try {
    Remove-Item -Path $path -Recurse -Force -ErrorAction Stop
    Write-Host "DELETE SUCCESS"
} catch {
    Write-Host "DELETE FAILED: $_"
    # Try to rename first
    try {
        Rename-Item -Path $path -NewName "client_to_delete_old" -Force -ErrorAction Stop
        Write-Host "RENAME SUCCESS"
        Remove-Item -Path "D:\React project\client_to_delete_old" -Recurse -Force -ErrorAction Stop
        Write-Host "DELETE AFTER RENAME SUCCESS"
    } catch {
        Write-Host "RENAME ALSO FAILED: $_"
    }
}
