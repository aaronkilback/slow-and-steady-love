import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  initializeEncryption,
  generateSalt,
  generateKeyPairFromPassword,
  encryptPrivateKeyForStorage,
  decryptPrivateKeyFromStorage,
  storeEncryptedPrivateKey,
  getStoredEncryptedPrivateKey,
  storeKeySalt,
  getStoredKeySalt,
  encryptMessage,
  decryptMessage,
  clearEncryptionData,
} from "@/lib/encryption";
import { useToast } from "@/hooks/use-toast";

interface EncryptionState {
  isInitialized: boolean;
  isUnlocked: boolean;
  publicKey: string | null;
  needsSetup: boolean;
}

export function useEncryption() {
  const [state, setState] = useState<EncryptionState>({
    isInitialized: false,
    isUnlocked: false,
    publicKey: null,
    needsSetup: false,
  });
  const [privateKey, setPrivateKey] = useState<Uint8Array | null>(null);
  const [publicKeyCache, setPublicKeyCache] = useState<Record<string, string>>({});
  const { toast } = useToast();

  // Initialize on mount
  useEffect(() => {
    const init = async () => {
      await initializeEncryption();
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setState(s => ({ ...s, isInitialized: true }));
        return;
      }

      // Check if user has encryption set up
      const { data: profile } = await supabase
        .from("profiles")
        .select("public_key, key_salt")
        .eq("id", user.id)
        .single();

      if (!profile?.public_key || !profile?.key_salt) {
        setState(s => ({ ...s, isInitialized: true, needsSetup: true }));
        return;
      }

      // Check if we have a stored private key
      const storedKey = getStoredEncryptedPrivateKey(user.id);
      const storedSalt = getStoredKeySalt(user.id);

      if (storedKey && storedSalt) {
        setState(s => ({ 
          ...s, 
          isInitialized: true, 
          publicKey: profile.public_key,
          needsSetup: false,
        }));
      } else {
        // Need to unlock with passphrase
        storeKeySalt(user.id, profile.key_salt);
        setState(s => ({ 
          ...s, 
          isInitialized: true, 
          publicKey: profile.public_key,
          needsSetup: false,
        }));
      }
    };

    init();
  }, []);

  /**
   * Set up encryption for a new user
   */
  const setupEncryption = useCallback(async (passphrase: string): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      // Generate salt and key pair
      const salt = await generateSalt();
      const { publicKey, privateKey: privKey } = await generateKeyPairFromPassword(passphrase, salt);

      // Encrypt private key for local storage
      const encryptedPrivKey = await encryptPrivateKeyForStorage(privKey, passphrase, salt);

      // Store in database
      const { error } = await supabase
        .from("profiles")
        .update({ public_key: publicKey, key_salt: salt })
        .eq("id", user.id);

      if (error) throw error;

      // Store locally
      storeEncryptedPrivateKey(user.id, encryptedPrivKey);
      storeKeySalt(user.id, salt);

      setPrivateKey(privKey);
      setState(s => ({ 
        ...s, 
        isUnlocked: true, 
        publicKey, 
        needsSetup: false 
      }));

      toast({
        title: "Encryption Enabled",
        description: "Your messages are now end-to-end encrypted.",
      });

      return true;
    } catch (error) {
      console.error("Setup encryption error:", error);
      toast({
        variant: "destructive",
        title: "Encryption Setup Failed",
        description: error instanceof Error ? error.message : "Unknown error",
      });
      return false;
    }
  }, [toast]);

  /**
   * Unlock encryption with passphrase
   */
  const unlockEncryption = useCallback(async (passphrase: string): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      // Get salt from profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("key_salt, public_key")
        .eq("id", user.id)
        .single();

      if (!profile?.key_salt) {
        toast({
          variant: "destructive",
          title: "Encryption Not Set Up",
          description: "Please set up encryption first.",
        });
        return false;
      }

      // Try to derive the key pair
      const { publicKey, privateKey: privKey } = await generateKeyPairFromPassword(
        passphrase, 
        profile.key_salt
      );

      // Verify the public key matches
      if (publicKey !== profile.public_key) {
        toast({
          variant: "destructive",
          title: "Invalid Passphrase",
          description: "The passphrase you entered is incorrect.",
        });
        return false;
      }

      // Encrypt and store private key locally
      const encryptedPrivKey = await encryptPrivateKeyForStorage(privKey, passphrase, profile.key_salt);
      storeEncryptedPrivateKey(user.id, encryptedPrivKey);
      storeKeySalt(user.id, profile.key_salt);

      setPrivateKey(privKey);
      setState(s => ({ ...s, isUnlocked: true, publicKey }));

      return true;
    } catch (error) {
      console.error("Unlock error:", error);
      toast({
        variant: "destructive",
        title: "Unlock Failed",
        description: "Invalid passphrase or corrupted data.",
      });
      return false;
    }
  }, [toast]);

  /**
   * Get a user's public key (with caching)
   */
  const getPublicKey = useCallback(async (userId: string): Promise<string | null> => {
    if (publicKeyCache[userId]) {
      return publicKeyCache[userId];
    }

    const { data } = await supabase
      .from("profiles")
      .select("public_key")
      .eq("id", userId)
      .single();

    if (data?.public_key) {
      setPublicKeyCache(prev => ({ ...prev, [userId]: data.public_key }));
      return data.public_key;
    }

    return null;
  }, [publicKeyCache]);

  /**
   * Encrypt a message for a recipient
   */
  const encrypt = useCallback(async (
    plaintext: string, 
    recipientUserId: string
  ): Promise<{ ciphertext: string; nonce: string } | null> => {
    if (!privateKey) {
      toast({
        variant: "destructive",
        title: "Encryption Locked",
        description: "Please unlock encryption first.",
      });
      return null;
    }

    const recipientPublicKey = await getPublicKey(recipientUserId);
    if (!recipientPublicKey) {
      // Recipient doesn't have encryption enabled
      return null;
    }

    try {
      return await encryptMessage(plaintext, recipientPublicKey, privateKey);
    } catch (error) {
      console.error("Encryption error:", error);
      return null;
    }
  }, [privateKey, getPublicKey, toast]);

  /**
   * Decrypt a message from a sender
   */
  const decrypt = useCallback(async (
    ciphertext: string,
    nonce: string,
    senderUserId: string
  ): Promise<string | null> => {
    if (!privateKey) {
      return null;
    }

    const senderPublicKey = await getPublicKey(senderUserId);
    if (!senderPublicKey) {
      return null;
    }

    try {
      return await decryptMessage(ciphertext, nonce, senderPublicKey, privateKey);
    } catch (error) {
      console.error("Decryption error:", error);
      return null;
    }
  }, [privateKey, getPublicKey]);

  /**
   * Lock encryption (clear private key from memory)
   */
  const lockEncryption = useCallback(() => {
    setPrivateKey(null);
    setState(s => ({ ...s, isUnlocked: false }));
  }, []);

  /**
   * Clear all encryption data (for logout)
   */
  const clearAll = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      clearEncryptionData(user.id);
    }
    setPrivateKey(null);
    setState({
      isInitialized: false,
      isUnlocked: false,
      publicKey: null,
      needsSetup: false,
    });
  }, []);

  return {
    ...state,
    setupEncryption,
    unlockEncryption,
    lockEncryption,
    encrypt,
    decrypt,
    getPublicKey,
    clearAll,
  };
}
